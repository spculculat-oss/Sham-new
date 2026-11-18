import { newId, hashPassword, type Vault } from './crypto';
import type { Sql } from './db';

export async function seedCommunity(sql: Sql, vault: Vault): Promise<void> {
  try {
    const [existing] = await sql.query(`SELECT count(*)::int AS count FROM users`);
    if (existing && existing.count >= 3) {
      return; // Already seeded
    }

    console.log('[community] Seeding initial master perfumers, formulas, discussions and posts...');

    const defaultPassHash = await hashPassword('Sham123456');

    // 1. Master Perfumers & Creators
    const users = [
      {
        id: 'u_dar_sham',
        handle: 'dar_sham',
        name: 'دار شام للعطور — الحساب الرسمي',
        email: 'official@dar-sham.perfume',
        role: 'admin',
        craft_level: 'master_lab',
        country: 'SY',
        bio: '🏛️ الصفحة الرسمية لدار شام للعطور ومجتمع صانعي العطور العربي. نشارك أحدث تجارب التعتيق ونوتات المعمل، ونقدم الاستشارات العطرية للرواد والمبتكرين.',
        avatar: 'https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=200&auto=format&fit=crop&q=80',
      },
      {
        id: 'u_ahmed_shaheen',
        handle: 'ahmed_shaheen',
        name: 'الكابتن أحمد شاهين — خبير العطور',
        email: 'ahmed@dar-sham.perfume',
        role: 'user',
        craft_level: 'perfumer',
        country: 'EG',
        bio: '🧪 صانع عطور وباحث في الكيمياء العطرية. متخصص في موازنة النوتات الشرقية، الفوحان المغناطيسي، وتعتيق أخشاب الصندل والعود.',
        avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=200&auto=format&fit=crop&q=80',
      },
      {
        id: 'u_nourhan',
        handle: 'nourhan_lab',
        name: 'م. نورهان الكردي — خبيرة التقطير',
        email: 'nourhan@dar-sham.perfume',
        role: 'user',
        craft_level: 'perfumer',
        country: 'SY',
        bio: '🌹 مهندسة كيميائية وباحثة في تقطير الزيوت العطرية النقية وزهور الورد الدمشقي والياسمين واللافندر الجبلي.',
        avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=200&auto=format&fit=crop&q=80',
      },
      {
        id: 'u_tariq_oud',
        handle: 'tariq_oud',
        name: 'الشيخ طارق العتيبي — خبير العود المعتق',
        email: 'tariq@dar-sham.perfume',
        role: 'user',
        craft_level: 'perfumer',
        country: 'SA',
        bio: '🪵 شغف ممتد لأكثر من 20 عاماً في دهن العود الكمبودي والبورمي والهندي الكلاكاسي المعتق، ومزجها مع العنبر والمسك.',
        avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&auto=format&fit=crop&q=80',
      },
      {
        id: 'u_layla_scents',
        handle: 'layla_scents',
        name: 'ليلى الأندلسي — هاوية تركيبات النيش',
        email: 'layla@dar-sham.perfume',
        role: 'user',
        craft_level: 'hobbyist',
        country: 'AE',
        bio: '✨ عاشقة لعطور النيش الفاخرة وابتكار طبقات عطرية مبتكرة بين الحمضيات المنعشة والجلود المدخنة مع الفانيليا التاهيتية.',
        avatar: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&auto=format&fit=crop&q=80',
      },
    ];

    for (const u of users) {
      const emailEnc = vault.seal(u.email);
      const emailIdx = vault.index(u.email);
      await sql.query(
        `INSERT INTO users (id, handle, name, email_idx, email_enc, pass_hash, role, status, country, lang, craft_level, bio, avatar, created_at, last_seen)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', $8, 'ar', $9, $10, $11, now() - interval '10 days', now())
         ON CONFLICT (id) DO NOTHING`,
        [u.id, u.handle, u.name, emailIdx, emailEnc, defaultPassHash, u.role, u.country, u.craft_level, u.bio, u.avatar]
      );
    }

    // 2. Initial Shared Recipes
    const r1 = {
      id: 'rec_sultan_oud',
      user_id: 'u_dar_sham',
      title: 'سلطان العود والباتشولي الملكي (Extrait 28%)',
      notes: 'تركيبة فاخرة تعتمد على العود الكمبودي والباتشولي الإندونيسي مع لمسة إيزو إي سوبر للفوحان الهادئ والثبات المتواصل.',
      data: {
        formulation: { concentrationPercent: 28, bottleVolumeMl: 100 },
        pyramidNotes: [
          { nameAr: 'برغموت إيطالي', percentageOfOil: 12 },
          { nameAr: 'حبهان وهيل أخضر', percentageOfOil: 8 },
          { nameAr: 'ورد بلغاري وزعفران', percentageOfOil: 20 },
          { nameAr: 'عود كمبودي معتق', percentageOfOil: 25 },
          { nameAr: 'باتشولي إندونيسي داكن', percentageOfOil: 20 },
          { nameAr: 'أمبروكسان وإيزو إي سوبر', percentageOfOil: 15 },
        ],
      },
    };

    const r2 = {
      id: 'rec_damask_rose',
      user_id: 'u_nourhan',
      title: 'نسيم الشام — خلاصة الورد الدمشقي والياسمين',
      notes: 'عطر زهري منعش مستخلص بالتقطير المائي لبتلات الورد الجوري مع لمسات المسك الأبيض وخشب الأرز.',
      data: {
        formulation: { concentrationPercent: 22, bottleVolumeMl: 50 },
        pyramidNotes: [
          { nameAr: 'يوسفي صقلي وزهر ليمون', percentageOfOil: 15 },
          { nameAr: 'ورد دمشقي مقطر طازج', percentageOfOil: 35 },
          { nameAr: 'ياسمين بلدي وأوسمانثوس', percentageOfOil: 20 },
          { nameAr: 'خشب أرز الأطلس', percentageOfOil: 18 },
          { nameAr: 'مسك أبيض بلوري نقي', percentageOfOil: 12 },
        ],
      },
    };

    const r3 = {
      id: 'rec_summer_spark',
      user_id: 'u_ahmed_shaheen',
      title: 'إكسير الانتعاش والفوحان (Sillage Spark)',
      notes: 'سر الفوحان الصيفي المتوازن بين الحمضيات والـ Hedione الذي يصنع هالة عطرية واسعة دون إزعاج.',
      data: {
        formulation: { concentrationPercent: 20, bottleVolumeMl: 100 },
        pyramidNotes: [
          { nameAr: 'ليمون كالابريا وريب غريب فروت', percentageOfOil: 22 },
          { nameAr: 'هيديون (Hedione) نقي', percentageOfOil: 25 },
          { nameAr: 'لافندر بروفانس الفرنسي', percentageOfOil: 15 },
          { nameAr: 'خشب الصندل الميسوري', percentageOfOil: 20 },
          { nameAr: 'عنبر حوتي رمادي ومسك الحرير', percentageOfOil: 18 },
        ],
      },
    };

    for (const r of [r1, r2, r3]) {
      await sql.query(
        `INSERT INTO recipes (id, user_id, title, data, notes, visibility, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, 'public', now() - interval '5 days', now())
         ON CONFLICT (id) DO NOTHING`,
        [r.id, r.user_id, r.title, JSON.stringify(r.data), r.notes]
      );
    }

    // 3. Initial Facebook-style Posts
    const posts = [
      {
        id: 'post_1',
        author_id: 'u_dar_sham',
        body: 'افتتاح موسم التعتيق الشتوي في معامل دار شام! 🍂\nقمنا اليوم بتعتيق أول دفعة من خلطة «سلطان العود والباتشولي» بتركيز 28% Extrait de Parfum في أوانٍ زجاجية داكنة معزولة عن الضوء.\n\nما هي أفضل درجة حرارة تعتمدونها لتعتيق زيوتكم الشتوية؟ وهل تفضلون التعتيق البارد أم درجة حرارة الغرفة الثابتة؟ شاركونا تجاربكم بالتعليقات!\n\n#تعتيق_العطور #دار_شام #كيمياء_العطور #سلطان_العود',
        recipe_id: 'rec_sultan_oud',
        image: 'https://images.unsplash.com/photo-1616949755610-8c9bbc08f138?w=800&auto=format&fit=crop&q=80',
        created_interval: '2 hours',
      },
      {
        id: 'post_2',
        author_id: 'u_ahmed_shaheen',
        body: 'سر من أسرار الفوحان الملكي: الكثير من المبتدئين يبالغون في استخدام الإيثانول النقي دون ضبط نسبة الماء المقطر وجزيئات الـ Hedione.\n\nالتوازن بين جزيء الـ Hedione والـ Iso E Super هو الذي يعطي الهالة العطرية (Sillage) الفخمة التي تبقى وتنتشر مع حركة الهواء دون خنق النوتات العليا.\n\nإليكم هذه التركيبة الصيفية المنعشة لتجربتها ومشاركتي رأيكم فيها 👇',
        recipe_id: 'rec_summer_spark',
        image: null,
        created_interval: '5 hours',
      },
      {
        id: 'post_3',
        author_id: 'u_nourhan',
        body: 'صباح الخير والعبير من معمل التقطير! 🌹✨\nانتهينا للتو من تقطير أول 50 كجم من بتلات الورد الجوري الدمشقي الطازج. النقاء مذهل ورائحة المكان تأسر القلوب!\n\nقمت برفع تركيبة «نسيم الشام» للمجتمع ليستفيد منها كل صانع عطور يبحث عن النقاء الزهري.\n\n#تقطير_طبيعي #ورد_دمشقي #معمل_شام #عطور_طبيعية',
        recipe_id: 'rec_damask_rose',
        image: 'https://images.unsplash.com/photo-1592945403244-b3fbafd7f539?w=800&auto=format&fit=crop&q=80',
        created_interval: '1 day',
      },
      {
        id: 'post_4',
        author_id: 'u_tariq_oud',
        body: 'سؤال للنقاش في مجلس العطارين:\nهل تفضلون دهن العود الكمبودي المعتق سويتي دافئ، أم العود الهندي الكلاكاسي الحيواني البخوري؟\n\nشخصياً أرى أن المزج الذكي بنسبة 1 إلى 3 مع خشب الأرز الأطلسي ينتج ثباتاً يمتد لأكثر من 48 ساعة على الأقمشة الصوفية! شاركونا آراءكم 🪵✨\n\n#مجلس_النقاش #دهن_العود #ثبات_العطور',
        recipe_id: null,
        image: 'https://images.unsplash.com/photo-1608571423902-eed4a5ad8108?w=800&auto=format&fit=crop&q=80',
        created_interval: '2 days',
      },
      {
        id: 'post_5',
        author_id: 'u_layla_scents',
        body: 'جربت أمس محاكي التعتيق في موقع دار شام مع تركيبة ليمون صقلي + لافندر فرنسي + توباكو وعنبر رمادي. النتيجة بعد 48 ساعة بالموجات الصوتية فاقت توقعاتي، الفوحان ممتاز جداً!\n\nشكراً لمجتمع شام على هذه الأدوات الاحترافية التي تجعل التركيب أسهل وأكثر دقة 🤍🧪',
        recipe_id: null,
        image: null,
        created_interval: '3 days',
      },
    ];

    for (const p of posts) {
      await sql.query(
        `INSERT INTO posts (id, author_id, body, image, recipe_id, visibility, status, created_at)
         VALUES ($1, $2, $3, $4, $5, 'public', 'visible', now() - interval '${p.created_interval}')
         ON CONFLICT (id) DO NOTHING`,
        [p.id, p.author_id, p.body, p.image, p.recipe_id]
      );
    }

    // 4. Initial Comments
    const comments = [
      { id: 'c_1', post_id: 'post_1', author_id: 'u_ahmed_shaheen', body: 'التعتيق في درجة حرارة 14-16 مئوية هو الأمثل لتفادي تطاير الجزيئات الخفيفة. خلطة ممتازة يا دار شام! 👏' },
      { id: 'c_2', post_id: 'post_1', author_id: 'u_tariq_oud', body: 'ما شاء الله تبارك الله، نسبة الـ 28% مع العود الكمبودي تعطي فخامة ملكية لا تضاهى.' },
      { id: 'c_3', post_id: 'post_2', author_id: 'u_layla_scents', body: 'معلومة ذهبية يا كابتن أحمد! كنت أتساءل دائماً لماذا تفقد بعض الخلطات فوحانها بعد أسبوعين. سأجرب إضافة الهيديون فوراً.' },
      { id: 'c_4', post_id: 'post_3', author_id: 'u_dar_sham', body: 'سلمت يداكِ يا باشمهندسة نورهان، الورد الدمشقي هو تاج العطور الشرقية دوماً 🌹' },
      { id: 'c_5', post_id: 'post_4', author_id: 'u_ahmed_shaheen', body: 'الكمبودي السويتي يعشقه الجميع، لكن الهندي الكلاكاسي له عشاق الذوق الرفيع المعتق. المزج مع الأرز الأطلسي فكرة عبقرية!' },
    ];

    for (const c of comments) {
      await sql.query(
        `INSERT INTO comments (id, post_id, author_id, body, status, created_at)
         VALUES ($1, $2, $3, $4, 'visible', now() - interval '1 hour')
         ON CONFLICT (id) DO NOTHING`,
        [c.id, c.post_id, c.author_id, c.body]
      );
    }

    // 5. Initial Reactions
    const reactions = [
      { post_id: 'post_1', user_id: 'u_ahmed_shaheen', kind: 'fire' },
      { post_id: 'post_1', user_id: 'u_nourhan', kind: 'love' },
      { post_id: 'post_1', user_id: 'u_tariq_oud', kind: 'like' },
      { post_id: 'post_2', user_id: 'u_dar_sham', kind: 'love' },
      { post_id: 'post_2', user_id: 'u_layla_scents', kind: 'wow' },
      { post_id: 'post_3', user_id: 'u_dar_sham', kind: 'love' },
      { post_id: 'post_3', user_id: 'u_ahmed_shaheen', kind: 'like' },
      { post_id: 'post_4', user_id: 'u_dar_sham', kind: 'fire' },
      { post_id: 'post_5', user_id: 'u_ahmed_shaheen', kind: 'love' },
    ];

    for (const r of reactions) {
      await sql.query(
        `INSERT INTO reactions (post_id, user_id, kind)
         VALUES ($1, $2, $3)
         ON CONFLICT (post_id, user_id) DO NOTHING`,
        [r.post_id, r.user_id, r.kind]
      );
    }

    // 6. Friendships between figures
    const pairs = [
      ['u_ahmed_shaheen', 'u_dar_sham'],
      ['u_dar_sham', 'u_nourhan'],
      ['u_dar_sham', 'u_tariq_oud'],
      ['u_ahmed_shaheen', 'u_layla_scents'],
      ['u_nourhan', 'u_tariq_oud'],
    ];

    for (const [a, b] of pairs) {
      const [u1, u2] = a < b ? [a, b] : [b, a];
      await sql.query(
        `INSERT INTO friendships (user_a, user_b, requester, status, created_at, accepted_at)
         VALUES ($1, $2, $3, 'accepted', now() - interval '10 days', now() - interval '9 days')
         ON CONFLICT (user_a, user_b) DO NOTHING`,
        [u1, u2, u1]
      );
    }

    console.log('[community] Seed complete! Master perfumers, posts, recipes, and comments are ready.');
  } catch (error) {
    console.error('[community] Seed error:', error);
  }
}
