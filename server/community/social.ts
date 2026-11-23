/**
 * «بوابة السوشيال» — the public feed, profiles, reactions, nested comments & comment likes, shares/reposts,
 * stories, Facebook-style groups & events, friends, blocking, pokes, reports and notifications.
 * Visibility and group privacy are enforced in SQL.
 */
import type { Row } from './db';
import { newId } from './crypto';
import {
  USER_COLUMNS,
  USER_FROM,
  areFriends,
  clean,
  fail,
  image,
  isBlocked,
  publicUser,
  required,
  sceneOrImage,
  type Ctx,
} from './service';

export const REACTIONS = ['like', 'love', 'wow', 'haha', 'sad', 'fire'] as const;
export const BG_STYLES = ['', 'amber', 'obsidian', 'rose', 'emerald', 'royal', 'sunset'] as const;
export const STORY_REACTIONS = ['', '❤️', '🔥', '😮', '👍', '🌹'] as const;
export const GROUP_CATEGORIES = ['general', 'oud', 'floral', 'lab', 'niche', 'trade'] as const;
export const EVENT_CATEGORIES = ['workshop', 'live', 'meetup', 'auction', 'launch'] as const;

const iso = (v: unknown) => (v ? new Date(v as string).toISOString() : null);
const PAGE = 20;

async function notify(ctx: Ctx, userId: string, kind: string, actorId: string, ref = '') {
  if (!userId || userId === actorId) return;
  await ctx.sql.query(
    `INSERT INTO notifications (id, user_id, kind, actor_id, ref) VALUES ($1,$2,$3,$4,$5)`,
    [newId('n'), userId, kind, actorId, ref]
  );
}

/* --------------------------------------------- posts --------------------------------------------- */

const POST_SELECT = `
  SELECT ${USER_COLUMNS}, p.id AS post_id, p.author_id, p.body, p.image, p.recipe_id, p.visibility,
    p.group_id, p.shared_post_id, p.location, p.bg_style, p.tagged_users, p.pinned,
    p.created_at AS post_created, p.edited_at,
    (SELECT count(*) FROM comments c WHERE c.post_id = p.id AND c.status = 'visible')::int AS comments,
    (SELECT count(*) FROM posts sp WHERE sp.shared_post_id = p.id AND sp.status = 'visible')::int AS share_count,
    (SELECT coalesce(json_object_agg(kind, n), '{}') FROM (SELECT kind, count(*)::int AS n FROM reactions r WHERE r.post_id = p.id GROUP BY kind) k) AS reaction_counts,
    (SELECT kind FROM reactions r WHERE r.post_id = p.id AND r.user_id = $1) AS my_reaction,
    (SELECT coalesce(json_object_agg(option_index::text, n), '{}') FROM (SELECT option_index, count(*)::int AS n FROM poll_votes pv WHERE pv.post_id = p.id GROUP BY option_index) pk) AS poll_votes,
    (SELECT option_index FROM poll_votes pv WHERE pv.post_id = p.id AND pv.user_id = $1) AS my_poll_vote,
    EXISTS (SELECT 1 FROM bookmarks bk WHERE bk.post_id = p.id AND bk.user_id = $1) AS bookmarked,
    rc.title AS recipe_title, rc.data AS recipe_data, rc.visibility AS recipe_visibility,
    cg.name AS group_name, cg.privacy AS group_privacy
  FROM posts p
  JOIN users u ON u.id = p.author_id
  LEFT JOIN merchants m ON m.user_id = u.id
  LEFT JOIN recipes rc ON rc.id = p.recipe_id
  LEFT JOIN community_groups cg ON cg.id = p.group_id`;

/** Rows the viewer may see: visible, author active, not blocked either way, group privacy respected, public or friend's (or own). */
const VISIBLE = `p.status = 'visible' AND u.status = 'active'
  AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = p.author_id) OR (b.blocker = p.author_id AND b.blocked = $1))
  AND (p.group_id IS NULL OR cg.privacy = 'public' OR EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = p.group_id AND gm.user_id = $1))
  AND (p.visibility = 'public' OR p.author_id = $1 OR EXISTS (
    SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND ((f.user_a = $1 AND f.user_b = p.author_id) OR (f.user_b = $1 AND f.user_a = p.author_id))))`;

export function postView(row: Row, viewerId: string, sharedPost: Record<string, unknown> | null = null) {
  const recipeVisible = row.recipe_title && (row.recipe_visibility !== 'private' || row.author_id === viewerId);
  const taggedUsers = Array.isArray(row.tagged_users) ? row.tagged_users : [];
  return {
    id: row.post_id,
    body: row.body,
    image: row.image || null,
    visibility: row.visibility,
    createdAt: iso(row.post_created),
    editedAt: iso(row.edited_at),
    author: publicUser(row),
    mine: row.author_id === viewerId,
    comments: row.comments,
    shareCount: Number(row.share_count || 0),
    reactions: row.reaction_counts || {},
    myReaction: row.my_reaction || null,
    pollVotes: row.poll_votes || {},
    myPollVote: row.my_poll_vote !== null && row.my_poll_vote !== undefined ? Number(row.my_poll_vote) : null,
    bookmarked: Boolean(row.bookmarked),
    location: row.location || '',
    bgStyle: row.bg_style || '',
    pinned: Boolean(row.pinned),
    taggedUsers,
    group: row.group_id && row.group_name ? { id: row.group_id, name: row.group_name, privacy: row.group_privacy } : null,
    sharedPostId: row.shared_post_id || null,
    sharedPost,
    recipe: recipeVisible ? { id: row.recipe_id, title: row.recipe_title, data: row.recipe_data } : null,
  };
}

async function hydratePosts(ctx: Ctx, viewerId: string, rows: Row[]) {
  const sharedIds = Array.from(new Set(rows.map((r) => r.shared_post_id).filter((id): id is string => Boolean(id))));
  const sharedMap = new Map<string, Record<string, unknown>>();
  if (sharedIds.length > 0) {
    const sharedRows = await ctx.sql.query(
      `${POST_SELECT} WHERE p.id = ANY($2::text[]) AND ${VISIBLE}`,
      [viewerId, sharedIds]
    );
    for (const sr of sharedRows) {
      sharedMap.set(sr.post_id, postView(sr, viewerId, null));
    }
  }
  return rows.map((r) => postView(r, viewerId, r.shared_post_id ? sharedMap.get(r.shared_post_id) || null : null));
}

/** The home feed: friends and the public, newest first, 20 at a time (`before` = createdAt of the last post). */
export async function feed(ctx: Ctx, viewerId: string, options: { before?: unknown; scope?: unknown; groupId?: unknown } = {}) {
  const params: unknown[] = [viewerId];
  let where = VISIBLE;
  let orderBy = `p.created_at DESC`;
  if (typeof options.before === 'string' && !Number.isNaN(Date.parse(options.before))) {
    params.push(options.before);
    where += ` AND p.created_at < $${params.length}`;
  }
  if (typeof options.groupId === 'string' && options.groupId) {
    params.push(options.groupId);
    where += ` AND p.group_id = $${params.length}`;
  } else if (options.scope === 'friends') {
    where += ` AND (p.author_id = $1 OR EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND ((f.user_a = $1 AND f.user_b = p.author_id) OR (f.user_b = $1 AND f.user_a = p.author_id))))`;
  } else if (options.scope === 'bookmarks') {
    where += ` AND EXISTS (SELECT 1 FROM bookmarks bk WHERE bk.post_id = p.id AND bk.user_id = $1)`;
  } else if (options.scope === 'memories') {
    where += ` AND (p.author_id = $1 OR EXISTS (SELECT 1 FROM friendships f WHERE f.status = 'accepted' AND ((f.user_a = $1 AND f.user_b = p.author_id) OR (f.user_b = $1 AND f.user_a = p.author_id))))`;
    orderBy = `p.created_at ASC`;
  } else if (options.scope === 'media') {
    where += ` AND p.image IS NOT NULL`;
  }
  const rows = await ctx.sql.query(`${POST_SELECT} WHERE ${where} ORDER BY ${orderBy} LIMIT ${PAGE}`, params);
  return hydratePosts(ctx, viewerId, rows);
}

export interface CreatePostInput {
  body?: unknown;
  image?: unknown;
  visibility?: unknown;
  recipeId?: unknown;
  groupId?: unknown;
  sharedPostId?: unknown;
  location?: unknown;
  bgStyle?: unknown;
  taggedUsers?: unknown;
}

export async function createPost(ctx: Ctx, authorId: string, input: CreatePostInput) {
  const body = clean(input.body, 5000);
  const picture = image(input.image, 500);
  const location = clean(input.location, 100);
  const rawBg = clean(input.bgStyle, 24);
  const bgStyle = BG_STYLES.includes(rawBg as typeof BG_STYLES[number]) ? rawBg : '';

  let recipeId: string | null = null;
  if (typeof input.recipeId === 'string' && input.recipeId) {
    const [r] = await ctx.sql.query(`SELECT id FROM recipes WHERE id = $1 AND user_id = $2`, [input.recipeId, authorId]);
    if (!r) fail(404, 'NOT_FOUND');
    recipeId = r.id;
  }

  let groupId: string | null = null;
  if (typeof input.groupId === 'string' && input.groupId) {
    const [grp] = await ctx.sql.query(`SELECT id, privacy FROM community_groups WHERE id = $1`, [input.groupId]);
    if (!grp) fail(404, 'NOT_FOUND');
    if (grp.privacy === 'closed') {
      const [mem] = await ctx.sql.query(
        `SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2`,
        [grp.id, authorId]
      );
      if (!mem) fail(403, 'NOT_GROUP_MEMBER');
    }
    groupId = grp.id;
  }

  let sharedPostId: string | null = null;
  let sharedAuthorId: string | null = null;
  if (typeof input.sharedPostId === 'string' && input.sharedPostId) {
    const original = await getPost(ctx, authorId, input.sharedPostId);
    sharedPostId = original.id;
    sharedAuthorId = original.author.id;
  }

  let taggedUsers: { id: string; name: string; handle: string }[] = [];
  if (Array.isArray(input.taggedUsers) && input.taggedUsers.length > 0) {
    const ids = Array.from(
      new Set(
        input.taggedUsers
          .map((x) => (typeof x === 'string' ? x : typeof x === 'object' && x ? String((x as { id?: unknown }).id || '') : ''))
          .filter((x) => x && x !== authorId)
      )
    ).slice(0, 8);
    if (ids.length > 0) {
      const rows = await ctx.sql.query(
        `SELECT id, name, handle FROM users u
         WHERE u.id = ANY($2::text[]) AND u.status = 'active'
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))`,
        [authorId, ids]
      );
      taggedUsers = rows.map((r) => ({ id: r.id, name: r.name, handle: r.handle }));
    }
  }

  if (!body && !picture && !recipeId && !sharedPostId) fail(400, 'EMPTY_POST');
  const [{ n }] = await ctx.sql.query(
    `SELECT count(*)::int AS n FROM posts WHERE author_id = $1 AND created_at > now() - interval '1 hour'`,
    [authorId]
  );
  if (n >= 30) fail(429, 'RATE_LIMITED');

  const id = newId('p');
  const visibility = input.visibility === 'friends' ? 'friends' : 'public';
  await ctx.sql.query(
    `INSERT INTO posts (id, author_id, body, image, recipe_id, visibility, group_id, shared_post_id, location, bg_style, tagged_users)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [id, authorId, body, picture, recipeId, visibility, groupId, sharedPostId, location, bgStyle, JSON.stringify(taggedUsers)]
  );

  if (sharedAuthorId) await notify(ctx, sharedAuthorId, 'share', authorId, id);
  for (const tu of taggedUsers) await notify(ctx, tu.id, 'tag', authorId, id);

  return getPost(ctx, authorId, id);
}

export async function getPost(ctx: Ctx, viewerId: string, id: string) {
  const [row] = await ctx.sql.query(`${POST_SELECT} WHERE p.id = $2 AND ${VISIBLE}`, [viewerId, id]);
  if (!row) fail(404, 'NOT_FOUND');
  const [hydrated] = await hydratePosts(ctx, viewerId, [row]);
  return hydrated;
}

export async function editPost(ctx: Ctx, userId: string, id: string, input: { body?: unknown; visibility?: unknown; location?: unknown }) {
  const rows = await ctx.sql.query(
    `UPDATE posts SET body = coalesce($1, body), visibility = coalesce($2, visibility), location = coalesce($3, location), edited_at = now()
     WHERE id = $4 AND author_id = $5 AND status = 'visible' RETURNING id`,
    [
      input.body !== undefined ? clean(input.body, 5000) : null,
      input.visibility === 'friends' || input.visibility === 'public' ? input.visibility : null,
      input.location !== undefined ? clean(input.location, 100) : null,
      id,
      userId,
    ]
  );
  if (!rows.length) fail(404, 'NOT_FOUND');
  return getPost(ctx, userId, id);
}

export async function pinPost(ctx: Ctx, userId: string, id: string) {
  const [row] = await ctx.sql.query(
    `SELECT id, pinned FROM posts WHERE id = $1 AND author_id = $2 AND status = 'visible'`,
    [id, userId]
  );
  if (!row) fail(404, 'NOT_FOUND');
  const nextPinned = !row.pinned;
  await ctx.sql.tx(async (t) => {
    if (nextPinned) {
      await t.query(`UPDATE posts SET pinned = false WHERE author_id = $1 AND id <> $2`, [userId, id]);
    }
    await t.query(`UPDATE posts SET pinned = $1 WHERE id = $2 AND author_id = $3`, [nextPinned, id, userId]);
  });
  return getPost(ctx, userId, id);
}

export async function deletePost(ctx: Ctx, userId: string, id: string) {
  const rows = await ctx.sql.query(`UPDATE posts SET status = 'deleted' WHERE id = $1 AND author_id = $2 RETURNING id`, [id, userId]);
  if (!rows.length) fail(404, 'NOT_FOUND');
}

export async function react(ctx: Ctx, userId: string, postId: string, kind: unknown) {
  const post = await getPost(ctx, userId, postId); // visibility check
  if (kind === null || kind === '' || kind === undefined) {
    await ctx.sql.query(`DELETE FROM reactions WHERE post_id = $1 AND user_id = $2`, [postId, userId]);
  } else {
    if (!REACTIONS.includes(kind as typeof REACTIONS[number])) fail(400, 'INVALID_REACTION');
    await ctx.sql.query(
      `INSERT INTO reactions (post_id, user_id, kind) VALUES ($1,$2,$3) ON CONFLICT (post_id, user_id) DO UPDATE SET kind = EXCLUDED.kind`,
      [postId, userId, kind]
    );
    if (!post.myReaction) await notify(ctx, post.author.id, 'reaction', userId, postId);
  }
  return getPost(ctx, userId, postId);
}

export async function votePoll(ctx: Ctx, userId: string, postId: string, optionIndex: unknown) {
  await getPost(ctx, userId, postId);
  const idx = Number(optionIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx > 5) fail(400, 'INVALID_FIELD', 'optionIndex');
  await ctx.sql.query(
    `INSERT INTO poll_votes (post_id, user_id, option_index) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET option_index = EXCLUDED.option_index`,
    [postId, userId, idx]
  );
  return getPost(ctx, userId, postId);
}

export async function toggleBookmark(ctx: Ctx, userId: string, postId: string) {
  await getPost(ctx, userId, postId);
  const [exists] = await ctx.sql.query(`SELECT 1 FROM bookmarks WHERE user_id = $1 AND post_id = $2`, [userId, postId]);
  if (exists) {
    await ctx.sql.query(`DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2`, [userId, postId]);
  } else {
    await ctx.sql.query(`INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [userId, postId]);
  }
  return getPost(ctx, userId, postId);
}

export async function comments(ctx: Ctx, viewerId: string, postId: string) {
  await getPost(ctx, viewerId, postId);
  const rows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, c.id AS comment_id, c.parent_id, c.body AS comment_body, c.created_at AS comment_created, c.author_id,
       (SELECT count(*) FROM comment_likes cl WHERE cl.comment_id = c.id)::int AS likes,
       EXISTS (SELECT 1 FROM comment_likes cl WHERE cl.comment_id = c.id AND cl.user_id = $1) AS liked_by_me
     FROM comments c
     JOIN users u ON u.id = c.author_id
     LEFT JOIN merchants m ON m.user_id = u.id
     WHERE c.post_id = $2 AND c.status = 'visible' AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = c.author_id) OR (b.blocker = c.author_id AND b.blocked = $1))
     ORDER BY c.created_at LIMIT 300`,
    [viewerId, postId]
  );
  return rows.map((r) => ({
    id: r.comment_id,
    parentId: r.parent_id || null,
    body: r.comment_body,
    createdAt: iso(r.comment_created),
    author: publicUser(r),
    mine: r.author_id === viewerId,
    likes: Number(r.likes || 0),
    likedByMe: Boolean(r.liked_by_me),
  }));
}

export async function addComment(ctx: Ctx, userId: string, postId: string, body: unknown, parentIdInput?: unknown) {
  const post = await getPost(ctx, userId, postId);
  const text = clean(body, 2000);
  if (!text) fail(400, 'EMPTY_COMMENT');

  let parentId: string | null = null;
  let parentAuthorId: string | null = null;
  if (typeof parentIdInput === 'string' && parentIdInput) {
    const [parent] = await ctx.sql.query(
      `SELECT id, parent_id, author_id FROM comments WHERE id = $1 AND post_id = $2 AND status = 'visible'`,
      [parentIdInput, postId]
    );
    if (!parent) fail(404, 'NOT_FOUND');
    // Keep threads tidy at 1 nesting level
    parentId = parent.parent_id || parent.id;
    parentAuthorId = parent.author_id;
  }

  await ctx.sql.query(
    `INSERT INTO comments (id, post_id, author_id, parent_id, body) VALUES ($1,$2,$3,$4,$5)`,
    [newId('c'), postId, userId, parentId, text]
  );
  await notify(ctx, post.author.id, 'comment', userId, postId);
  if (parentAuthorId && parentAuthorId !== post.author.id) {
    await notify(ctx, parentAuthorId, 'comment_reply', userId, postId);
  }
  return comments(ctx, userId, postId);
}

export async function toggleCommentLike(ctx: Ctx, userId: string, commentId: string) {
  const [c] = await ctx.sql.query(
    `SELECT c.id, c.post_id, c.author_id FROM comments c WHERE c.id = $1 AND c.status = 'visible'`,
    [commentId]
  );
  if (!c) fail(404, 'NOT_FOUND');
  await getPost(ctx, userId, c.post_id);
  const [exists] = await ctx.sql.query(`SELECT 1 FROM comment_likes WHERE comment_id = $1 AND user_id = $2`, [commentId, userId]);
  if (exists) {
    await ctx.sql.query(`DELETE FROM comment_likes WHERE comment_id = $1 AND user_id = $2`, [commentId, userId]);
  } else {
    await ctx.sql.query(`INSERT INTO comment_likes (comment_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [commentId, userId]);
    await notify(ctx, c.author_id, 'comment_like', userId, c.post_id);
  }
  const [countRow] = await ctx.sql.query(`SELECT count(*)::int AS n FROM comment_likes WHERE comment_id = $1`, [commentId]);
  return { id: commentId, likes: Number(countRow?.n || 0), likedByMe: !exists };
}

export async function deleteComment(ctx: Ctx, userId: string, commentId: string) {
  // The comment's author or the post's author may remove it.
  const rows = await ctx.sql.query(
    `UPDATE comments c SET status = 'deleted' FROM posts p WHERE c.id = $1 AND p.id = c.post_id AND (c.author_id = $2 OR p.author_id = $2) RETURNING c.id`,
    [commentId, userId]
  );
  if (!rows.length) fail(404, 'NOT_FOUND');
}

/* -------------------------------------------- stories -------------------------------------------- */

export async function listStories(ctx: Ctx, viewerId: string) {
  const rows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, s.id AS story_id, s.author_id, s.title, s.caption, s.image, s.scent_tag, s.bg_style, s.created_at AS story_created, s.expires_at,
       (SELECT count(*) FROM story_views sv WHERE sv.story_id = s.id)::int AS views,
       EXISTS (SELECT 1 FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = $1) AS viewed_by_me,
       (SELECT reaction FROM story_views sv WHERE sv.story_id = s.id AND sv.user_id = $1) AS my_reaction,
       (SELECT coalesce(json_object_agg(reaction, n), '{}') FROM (SELECT reaction, count(*)::int AS n FROM story_views sv WHERE sv.story_id = s.id AND sv.reaction <> '' GROUP BY reaction) rk) AS reaction_counts
     FROM stories s
     JOIN users u ON u.id = s.author_id
     LEFT JOIN merchants m ON m.user_id = u.id
     WHERE s.status = 'visible' AND s.expires_at > now() AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = s.author_id) OR (b.blocker = s.author_id AND b.blocked = $1))
     ORDER BY s.created_at DESC LIMIT 40`,
    [viewerId]
  );
  return rows.map((r) => ({
    id: r.story_id,
    title: r.title || '',
    caption: r.caption || '',
    image: r.image,
    scentTag: r.scent_tag || '',
    bgStyle: r.bg_style || '',
    createdAt: iso(r.story_created),
    expiresAt: iso(r.expires_at),
    user: publicUser(r),
    mine: r.author_id === viewerId,
    views: Number(r.views || 0),
    viewedByMe: Boolean(r.viewed_by_me),
    myReaction: r.my_reaction || '',
    reactions: r.reaction_counts || {},
  }));
}

export async function createStory(
  ctx: Ctx,
  userId: string,
  input: { title?: unknown; caption?: unknown; image?: unknown; scentTag?: unknown; bgStyle?: unknown }
) {
  const caption = clean(input.caption, 400);
  const title = clean(input.title, 80);
  if (!caption && !title) fail(400, 'EMPTY_STORY');
  const img = sceneOrImage(input.image || 'scene:compounding', 500) || 'scene:compounding';
  const scentTag = clean(input.scentTag, 60);
  const bgStyle = BG_STYLES.includes(clean(input.bgStyle, 24) as typeof BG_STYLES[number]) ? clean(input.bgStyle, 24) : '';
  const [{ n }] = await ctx.sql.query(
    `SELECT count(*)::int AS n FROM stories WHERE author_id = $1 AND created_at > now() - interval '1 day' AND status = 'visible'`,
    [userId]
  );
  if (n >= 25) fail(429, 'RATE_LIMITED');
  const id = newId('st');
  await ctx.sql.query(
    `INSERT INTO stories (id, author_id, title, caption, image, scent_tag, bg_style) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, userId, title, caption, img, scentTag, bgStyle]
  );
  return listStories(ctx, userId);
}

export async function reactStory(ctx: Ctx, userId: string, storyId: string, reactionInput?: unknown) {
  const [st] = await ctx.sql.query(
    `SELECT id, author_id FROM stories WHERE id = $1 AND status = 'visible' AND expires_at > now()`,
    [storyId]
  );
  if (!st) fail(404, 'NOT_FOUND');
  if (await isBlocked(ctx.sql, userId, st.author_id)) fail(404, 'NOT_FOUND');
  const reaction = typeof reactionInput === 'string' && STORY_REACTIONS.includes(reactionInput as typeof STORY_REACTIONS[number])
    ? reactionInput
    : undefined;

  if (reaction !== undefined) {
    await ctx.sql.query(
      `INSERT INTO story_views (story_id, user_id, reaction) VALUES ($1, $2, $3)
       ON CONFLICT (story_id, user_id) DO UPDATE SET reaction = EXCLUDED.reaction`,
      [storyId, userId, reaction]
    );
    if (reaction) await notify(ctx, st.author_id, 'story_reaction', userId, storyId);
  } else {
    await ctx.sql.query(
      `INSERT INTO story_views (story_id, user_id, reaction) VALUES ($1, $2, '') ON CONFLICT (story_id, user_id) DO NOTHING`,
      [storyId, userId]
    );
  }
  const [counts] = await ctx.sql.query(
    `SELECT count(*)::int AS views,
       (SELECT coalesce(json_object_agg(reaction, n), '{}') FROM (SELECT reaction, count(*)::int AS n FROM story_views sv WHERE sv.story_id = $1 AND sv.reaction <> '' GROUP BY reaction) rk) AS reaction_counts
     FROM story_views WHERE story_id = $1`,
    [storyId]
  );
  return { id: storyId, views: Number(counts?.views || 0), reactions: counts?.reaction_counts || {}, myReaction: reaction ?? '' };
}

export async function deleteStory(ctx: Ctx, userId: string, storyId: string) {
  const rows = await ctx.sql.query(
    `UPDATE stories SET status = 'deleted' WHERE id = $1 AND author_id = $2 RETURNING id`,
    [storyId, userId]
  );
  if (!rows.length) fail(404, 'NOT_FOUND');
}

/* -------------------------------------------- groups -------------------------------------------- */

function groupView(r: Row, viewerId: string) {
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    category: r.category || 'general',
    privacy: r.privacy === 'closed' ? 'closed' : 'public',
    cover: r.cover || 'scene:compounding',
    createdAt: iso(r.created_at),
    memberCount: Number(r.member_count || 0),
    postCount: Number(r.post_count || 0),
    joined: Boolean(r.joined),
    myRole: r.my_role || null,
    mine: r.creator_id === viewerId,
    creator: r.handle ? publicUser(r) : null,
  };
}

export async function listGroups(ctx: Ctx, viewerId: string, options: { category?: unknown; mine?: unknown } = {}) {
  const params: unknown[] = [viewerId];
  let where = `u.status = 'active' AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = g.creator_id) OR (b.blocker = g.creator_id AND b.blocked = $1))`;
  if (typeof options.category === 'string' && GROUP_CATEGORIES.includes(options.category as typeof GROUP_CATEGORIES[number])) {
    params.push(options.category);
    where += ` AND g.category = $${params.length}`;
  }
  if (options.mine === '1' || options.mine === 'true') {
    where += ` AND EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1)`;
  }
  const rows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, g.id, g.name, g.description, g.category, g.privacy, g.cover, g.creator_id, g.created_at,
       (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id)::int AS member_count,
       (SELECT count(*) FROM posts p WHERE p.group_id = g.id AND p.status = 'visible')::int AS post_count,
       EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1) AS joined,
       (SELECT gm.role FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1) AS my_role
     FROM community_groups g
     JOIN users u ON u.id = g.creator_id
     LEFT JOIN merchants m ON m.user_id = u.id
     WHERE ${where}
     ORDER BY member_count DESC, g.created_at DESC LIMIT 60`,
    params
  );
  return rows.map((r) => groupView(r, viewerId));
}

export async function getGroup(ctx: Ctx, viewerId: string, groupId: string) {
  const [row] = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, g.id, g.name, g.description, g.category, g.privacy, g.cover, g.creator_id, g.created_at,
       (SELECT count(*) FROM group_members gm WHERE gm.group_id = g.id)::int AS member_count,
       (SELECT count(*) FROM posts p WHERE p.group_id = g.id AND p.status = 'visible')::int AS post_count,
       EXISTS (SELECT 1 FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1) AS joined,
       (SELECT gm.role FROM group_members gm WHERE gm.group_id = g.id AND gm.user_id = $1) AS my_role
     FROM community_groups g
     JOIN users u ON u.id = g.creator_id
     LEFT JOIN merchants m ON m.user_id = u.id
     WHERE g.id = $2`,
    [viewerId, groupId]
  );
  if (!row) fail(404, 'NOT_FOUND');
  const group = groupView(row, viewerId);
  const membersRows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, gm.role AS gm_role FROM group_members gm JOIN users u ON u.id = gm.user_id LEFT JOIN merchants m ON m.user_id = u.id
     WHERE gm.group_id = $1 AND u.status = 'active' ORDER BY (gm.role = 'admin') DESC, gm.joined_at ASC LIMIT 24`,
    [groupId]
  );
  const locked = group.privacy === 'closed' && !group.joined;
  const posts = locked ? [] : await feed(ctx, viewerId, { groupId });
  return {
    group,
    locked,
    members: membersRows.map((m) => ({ ...publicUser(m), groupRole: m.gm_role })),
    posts,
  };
}

export async function createGroup(
  ctx: Ctx,
  userId: string,
  input: { name?: unknown; description?: unknown; category?: unknown; privacy?: unknown; cover?: unknown }
) {
  const name = required(input.name, 'name', 2, 80);
  const description = clean(input.description, 1000);
  const cat = clean(input.category, 20);
  const category = GROUP_CATEGORIES.includes(cat as typeof GROUP_CATEGORIES[number]) ? cat : 'general';
  const privacy = input.privacy === 'closed' ? 'closed' : 'public';
  const cover = sceneOrImage(input.cover || 'scene:compounding', 450) || 'scene:compounding';
  const [{ n }] = await ctx.sql.query(
    `SELECT count(*)::int AS n FROM community_groups WHERE creator_id = $1`,
    [userId]
  );
  if (n >= 20) fail(429, 'RATE_LIMITED');
  const id = newId('grp');
  await ctx.sql.tx(async (t) => {
    await t.query(
      `INSERT INTO community_groups (id, name, description, category, privacy, cover, creator_id) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, name, description, category, privacy, cover, userId]
    );
    await t.query(
      `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'admin')`,
      [id, userId]
    );
  });
  return (await getGroup(ctx, userId, id)).group;
}

export async function joinGroup(ctx: Ctx, userId: string, groupId: string) {
  const [grp] = await ctx.sql.query(`SELECT id, creator_id FROM community_groups WHERE id = $1`, [groupId]);
  if (!grp) fail(404, 'NOT_FOUND');
  await ctx.sql.query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'member') ON CONFLICT (group_id, user_id) DO NOTHING`,
    [groupId, userId]
  );
  await notify(ctx, grp.creator_id, 'group_join', userId, groupId);
  return getGroup(ctx, userId, groupId);
}

export async function leaveGroup(ctx: Ctx, userId: string, groupId: string) {
  await ctx.sql.query(`DELETE FROM group_members WHERE group_id = $1 AND user_id = $2 AND role <> 'admin'`, [groupId, userId]);
  return getGroup(ctx, userId, groupId);
}

/* -------------------------------------------- events -------------------------------------------- */

export async function listEvents(ctx: Ctx, viewerId: string, options: { filter?: unknown } = {}) {
  const params: unknown[] = [viewerId];
  let where = `u.status = 'active' AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = e.creator_id) OR (b.blocker = e.creator_id AND b.blocked = $1))`;
  if (options.filter === 'mine') {
    where += ` AND (e.creator_id = $1 OR EXISTS (SELECT 1 FROM event_rsvps er WHERE er.event_id = e.id AND er.user_id = $1))`;
  } else if (options.filter === 'online') {
    where += ` AND e.is_online = true`;
  }
  const rows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, e.id, e.creator_id, e.title, e.description, e.location, e.is_online, e.starts_at, e.cover, e.category, e.created_at,
       (SELECT count(*) FROM event_rsvps er WHERE er.event_id = e.id AND er.status = 'going')::int AS going_count,
       (SELECT count(*) FROM event_rsvps er WHERE er.event_id = e.id AND er.status = 'interested')::int AS interested_count,
       (SELECT er.status FROM event_rsvps er WHERE er.event_id = e.id AND er.user_id = $1) AS my_rsvp
     FROM events e
     JOIN users u ON u.id = e.creator_id
     LEFT JOIN merchants m ON m.user_id = u.id
     WHERE ${where}
     ORDER BY e.starts_at ASC LIMIT 40`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    description: r.description || '',
    location: r.location || '',
    isOnline: Boolean(r.is_online),
    startsAt: iso(r.starts_at),
    cover: r.cover || 'scene:exhibition',
    category: r.category || 'workshop',
    createdAt: iso(r.created_at),
    goingCount: Number(r.going_count || 0),
    interestedCount: Number(r.interested_count || 0),
    myRsvp: r.my_rsvp || null,
    mine: r.creator_id === viewerId,
    creator: publicUser(r),
  }));
}

export async function createEvent(
  ctx: Ctx,
  userId: string,
  input: { title?: unknown; description?: unknown; location?: unknown; isOnline?: unknown; startsAt?: unknown; cover?: unknown; category?: unknown }
) {
  const title = required(input.title, 'title', 3, 120);
  const description = clean(input.description, 1500);
  const isOnline = input.isOnline === true;
  const location = clean(input.location, 160) || (isOnline ? 'بث مباشر — معمل شام' : '');
  const startsRaw = typeof input.startsAt === 'string' ? Date.parse(input.startsAt) : NaN;
  const startsAt = Number.isNaN(startsRaw) ? new Date(Date.now() + 3 * 86_400_000).toISOString() : new Date(startsRaw).toISOString();
  const cat = clean(input.category, 24);
  const category = EVENT_CATEGORIES.includes(cat as typeof EVENT_CATEGORIES[number]) ? cat : 'workshop';
  const cover = sceneOrImage(input.cover || 'scene:exhibition', 450) || 'scene:exhibition';
  const [{ n }] = await ctx.sql.query(
    `SELECT count(*)::int AS n FROM events WHERE creator_id = $1 AND created_at > now() - interval '1 day'`,
    [userId]
  );
  if (n >= 20) fail(429, 'RATE_LIMITED');
  const id = newId('evt');
  await ctx.sql.tx(async (t) => {
    await t.query(
      `INSERT INTO events (id, creator_id, title, description, location, is_online, starts_at, cover, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [id, userId, title, description, location, isOnline, startsAt, cover, category]
    );
    await t.query(
      `INSERT INTO event_rsvps (event_id, user_id, status) VALUES ($1, $2, 'going')`,
      [id, userId]
    );
  });
  const list = await listEvents(ctx, userId);
  return list.find((e) => e.id === id) || list[0];
}

export async function rsvpEvent(ctx: Ctx, userId: string, eventId: string, statusInput: unknown) {
  const [evt] = await ctx.sql.query(`SELECT id, creator_id FROM events WHERE id = $1`, [eventId]);
  if (!evt) fail(404, 'NOT_FOUND');
  if (statusInput === null || statusInput === '' || statusInput === 'none') {
    await ctx.sql.query(`DELETE FROM event_rsvps WHERE event_id = $1 AND user_id = $2`, [eventId, userId]);
  } else {
    const status = statusInput === 'going' ? 'going' : statusInput === 'interested' ? 'interested' : '';
    if (!status) fail(400, 'INVALID_FIELD', 'status');
    await ctx.sql.query(
      `INSERT INTO event_rsvps (event_id, user_id, status, updated_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (event_id, user_id) DO UPDATE SET status = EXCLUDED.status, updated_at = now()`,
      [eventId, userId, status]
    );
    await notify(ctx, evt.creator_id, 'event_rsvp', userId, eventId);
  }
  const [counts] = await ctx.sql.query(
    `SELECT
       (SELECT count(*) FROM event_rsvps WHERE event_id = $1 AND status = 'going')::int AS going_count,
       (SELECT count(*) FROM event_rsvps WHERE event_id = $1 AND status = 'interested')::int AS interested_count,
       (SELECT status FROM event_rsvps WHERE event_id = $1 AND user_id = $2) AS my_rsvp`,
    [eventId, userId]
  );
  return {
    id: eventId,
    goingCount: Number(counts?.going_count || 0),
    interestedCount: Number(counts?.interested_count || 0),
    myRsvp: counts?.my_rsvp || null,
  };
}

/* -------------------------------------------- people -------------------------------------------- */

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

export async function relation(ctx: Ctx, viewerId: string, otherId: string): Promise<'self' | 'friends' | 'requested' | 'incoming' | 'blocked' | 'none'> {
  if (viewerId === otherId) return 'self';
  const [blocked] = await ctx.sql.query(`SELECT 1 FROM blocks WHERE blocker = $1 AND blocked = $2`, [viewerId, otherId]);
  if (blocked) return 'blocked';
  const [x, y] = pair(viewerId, otherId);
  const [f] = await ctx.sql.query(`SELECT status, requester FROM friendships WHERE user_a = $1 AND user_b = $2`, [x, y]);
  if (!f) return 'none';
  if (f.status === 'accepted') return 'friends';
  return f.requester === viewerId ? 'requested' : 'incoming';
}

export async function profile(ctx: Ctx, viewerId: string, handle: string) {
  const [row] = await ctx.sql.query(`SELECT ${USER_COLUMNS} FROM ${USER_FROM} WHERE u.handle = $1 AND u.status = 'active'`, [clean(handle, 40).toLowerCase()]);
  if (!row) fail(404, 'NOT_FOUND');
  const [blockedMe] = await ctx.sql.query(`SELECT 1 FROM blocks WHERE blocker = $1 AND blocked = $2`, [row.id, viewerId]);
  if (blockedMe) fail(404, 'NOT_FOUND');
  const [counts] = await ctx.sql.query(
    `SELECT (SELECT count(*) FROM friendships WHERE (user_a = $1 OR user_b = $1) AND status = 'accepted')::int AS friends,
            (SELECT count(*) FROM posts WHERE author_id = $1 AND status = 'visible')::int AS posts,
            (SELECT count(*) FROM recipes WHERE user_id = $1 AND visibility = 'public')::int AS recipes`,
    [row.id]
  );
  const postRows = await ctx.sql.query(
    `${POST_SELECT} WHERE p.author_id = $2 AND ${VISIBLE} ORDER BY p.pinned DESC, p.created_at DESC LIMIT ${PAGE}`,
    [viewerId, row.id]
  );
  const friends = row.id === viewerId || (await areFriends(ctx.sql, row.id, viewerId));
  const recipes = await ctx.sql.query(
    `SELECT id, title, data, updated_at FROM recipes WHERE user_id = $1 AND (visibility = 'public' OR ($2 AND visibility = 'friends') OR user_id = $3) ORDER BY updated_at DESC LIMIT 30`,
    [row.id, friends, viewerId]
  );
  const friendsRows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS} FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
     LEFT JOIN merchants m ON m.user_id = u.id
     WHERE (f.user_a = $1 OR f.user_b = $1) AND f.status = 'accepted' AND u.status = 'active'
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $2 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $2))
     ORDER BY u.last_seen DESC LIMIT 12`,
    [row.id, viewerId]
  );
  return {
    user: publicUser(row),
    relation: await relation(ctx, viewerId, row.id),
    counts,
    posts: await hydratePosts(ctx, viewerId, postRows),
    recipes: recipes.map((r) => ({ id: r.id, title: r.title, data: r.data, updatedAt: iso(r.updated_at) })),
    friendsList: friendsRows.map(publicUser),
  };
}

/** People search by name or @handle (blocked people excluded both ways). */
export async function searchPeople(ctx: Ctx, viewerId: string, query: unknown) {
  const q = clean(query, 60).replace(/^@/, '').toLowerCase();
  if (q.length < 2) return [];
  const rows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS} FROM ${USER_FROM} WHERE u.status = 'active' AND u.id <> $1
       AND (lower(u.name) LIKE $2 OR u.handle LIKE $2)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
     ORDER BY (u.handle = $3) DESC, u.last_seen DESC LIMIT 25`,
    [viewerId, `%${q.replace(/[%_\\]/g, '')}%`, q]
  );
  return rows.map(publicUser);
}

/** «أشخاص قد تعرفهم»: friends of friends first, then active people from the same country. */
export async function suggestions(ctx: Ctx, viewerId: string) {
  const rows = await ctx.sql.query(
    `WITH mine AS (SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS id FROM friendships WHERE (user_a = $1 OR user_b = $1)),
          fof AS (SELECT CASE WHEN f.user_a = mine.id THEN f.user_b ELSE f.user_a END AS id, count(*) AS n
                  FROM friendships f JOIN mine ON (f.user_a = mine.id OR f.user_b = mine.id) WHERE f.status = 'accepted' GROUP BY 1)
     SELECT ${USER_COLUMNS}, coalesce(fof.n, 0)::int AS mutual FROM ${USER_FROM} LEFT JOIN fof ON fof.id = u.id
     WHERE u.status = 'active' AND u.id <> $1 AND u.id NOT IN (SELECT id FROM mine)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker = $1 AND b.blocked = u.id) OR (b.blocker = u.id AND b.blocked = $1))
     ORDER BY mutual DESC, (u.country = (SELECT country FROM users WHERE id = $1)) DESC, u.last_seen DESC LIMIT 12`,
    [viewerId]
  );
  return rows.map((r) => ({ ...publicUser(r), mutual: r.mutual }));
}

export async function pokeUser(ctx: Ctx, userId: string, targetId: string) {
  if (userId === targetId) fail(400, 'INVALID_TARGET');
  const [other] = await ctx.sql.query(`SELECT id FROM users WHERE id = $1 AND status = 'active'`, [targetId]);
  if (!other || (await isBlocked(ctx.sql, userId, targetId))) fail(404, 'NOT_FOUND');
  const [recent] = await ctx.sql.query(
    `SELECT 1 FROM notifications WHERE user_id = $1 AND actor_id = $2 AND kind = 'poke' AND created_at > now() - interval '1 hour'`,
    [targetId, userId]
  );
  if (!recent) {
    await notify(ctx, targetId, 'poke', userId, userId);
  }
  return { ok: true };
}

export async function requestFriend(ctx: Ctx, userId: string, otherId: string) {
  if (userId === otherId) fail(400, 'INVALID_TARGET');
  const [other] = await ctx.sql.query(`SELECT id FROM users WHERE id = $1 AND status = 'active'`, [otherId]);
  if (!other || (await isBlocked(ctx.sql, userId, otherId))) fail(404, 'NOT_FOUND');
  const [x, y] = pair(userId, otherId);
  const [existing] = await ctx.sql.query(`SELECT status, requester FROM friendships WHERE user_a = $1 AND user_b = $2`, [x, y]);
  if (existing?.status === 'accepted') return 'friends';
  if (existing && existing.requester !== userId) return acceptFriend(ctx, userId, otherId); // both asked: friends
  if (!existing) {
    const [{ n }] = await ctx.sql.query(`SELECT count(*)::int AS n FROM friendships WHERE requester = $1 AND status = 'pending' AND created_at > now() - interval '1 day'`, [userId]);
    if (n >= 100) fail(429, 'RATE_LIMITED');
    await ctx.sql.query(`INSERT INTO friendships (user_a, user_b, requester) VALUES ($1,$2,$3)`, [x, y, userId]);
    await notify(ctx, otherId, 'friend_request', userId);
  }
  return 'requested';
}

export async function acceptFriend(ctx: Ctx, userId: string, otherId: string) {
  const [x, y] = pair(userId, otherId);
  const rows = await ctx.sql.query(
    `UPDATE friendships SET status = 'accepted', accepted_at = now() WHERE user_a = $1 AND user_b = $2 AND status = 'pending' AND requester <> $3 RETURNING 1`,
    [x, y, userId]
  );
  if (!rows.length) fail(404, 'NOT_FOUND');
  await notify(ctx, otherId, 'friend_accepted', userId);
  return 'friends' as const;
}

/** Decline a request, cancel mine, or unfriend. */
export async function removeFriend(ctx: Ctx, userId: string, otherId: string) {
  const [x, y] = pair(userId, otherId);
  await ctx.sql.query(`DELETE FROM friendships WHERE user_a = $1 AND user_b = $2`, [x, y]);
  return 'none' as const;
}

export async function friends(ctx: Ctx, userId: string) {
  const list = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, f.status, f.requester FROM friendships f JOIN users u ON u.id = CASE WHEN f.user_a = $1 THEN f.user_b ELSE f.user_a END
     LEFT JOIN merchants m ON m.user_id = u.id WHERE (f.user_a = $1 OR f.user_b = $1) AND u.status = 'active' ORDER BY u.last_seen DESC`,
    [userId]
  );
  return {
    friends: list.filter((r) => r.status === 'accepted').map(publicUser),
    incoming: list.filter((r) => r.status === 'pending' && r.requester !== userId).map(publicUser),
    outgoing: list.filter((r) => r.status === 'pending' && r.requester === userId).map(publicUser),
  };
}

export async function block(ctx: Ctx, userId: string, otherId: string) {
  if (userId === otherId) fail(400, 'INVALID_TARGET');
  await ctx.sql.query(`INSERT INTO blocks (blocker, blocked) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [userId, otherId]);
  await removeFriend(ctx, userId, otherId);
}

export async function unblock(ctx: Ctx, userId: string, otherId: string) {
  await ctx.sql.query(`DELETE FROM blocks WHERE blocker = $1 AND blocked = $2`, [userId, otherId]);
}

export async function blockedList(ctx: Ctx, userId: string) {
  const rows = await ctx.sql.query(`SELECT ${USER_COLUMNS} FROM blocks b JOIN users u ON u.id = b.blocked LEFT JOIN merchants m ON m.user_id = u.id WHERE b.blocker = $1`, [userId]);
  return rows.map(publicUser);
}

const REPORT_KINDS = ['post', 'comment', 'user', 'message', 'product', 'store', 'group', 'event'];
export async function report(ctx: Ctx, userId: string, input: { kind?: unknown; id?: unknown; reason?: unknown }) {
  const kind = String(input.kind);
  if (!REPORT_KINDS.includes(kind)) fail(400, 'INVALID_FIELD', 'kind');
  const id = clean(input.id, 80);
  if (!id) fail(400, 'INVALID_FIELD', 'id');
  const [{ n }] = await ctx.sql.query(`SELECT count(*)::int AS n FROM reports WHERE reporter_id = $1 AND created_at > now() - interval '1 day'`, [userId]);
  if (n >= 50) fail(429, 'RATE_LIMITED');
  await ctx.sql.query(`INSERT INTO reports (id, reporter_id, target_kind, target_id, reason) VALUES ($1,$2,$3,$4,$5)`, [newId('rp'), userId, kind, id, clean(input.reason, 1000)]);
}

/* ------------------------------------------ notifications ------------------------------------------ */

export async function notifications(ctx: Ctx, userId: string) {
  const rows = await ctx.sql.query(
    `SELECT ${USER_COLUMNS}, n.id AS n_id, n.kind AS n_kind, n.ref AS n_ref, n.created_at AS n_created, n.read_at FROM notifications n LEFT JOIN users u ON u.id = n.actor_id
     LEFT JOIN merchants m ON m.user_id = u.id WHERE n.user_id = $1 ORDER BY n.created_at DESC LIMIT 60`,
    [userId]
  );
  return rows.map((r) => ({ id: r.n_id, kind: r.n_kind, ref: r.n_ref, createdAt: iso(r.n_created), read: Boolean(r.read_at), actor: r.handle ? publicUser(r) : null }));
}

export async function readNotifications(ctx: Ctx, userId: string) {
  await ctx.sql.query(`UPDATE notifications SET read_at = now() WHERE user_id = $1 AND read_at IS NULL`, [userId]);
}
