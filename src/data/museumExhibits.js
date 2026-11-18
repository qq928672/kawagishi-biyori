// 承翰故事館展品資料（文字與圖片對應集中在這裡，方便日後更新）
//
// 資料來源：專案內「承翰_自我介紹簡報」資料夾（簡報.html 與其圖片、影片）。
// 原則：摘要保留原意，不編造資料或數據；簡報沒有提供的內容不顯示（欄位留空即可）。
// 圖片由 tools/import-museum.ps1 從簡報資料夾複製、縮圖到 public/assets/museum/，這裡用相對路徑載入。
//
// 欄位：
// - zone：展區（learning / education / digital）
// - prop：館內擺設的造型（MuseumScene 依此繪製）
// - title：展品標題（簡短，顯示在館內）；subtitle：一句話說明
// - thumb：館內縮圖（public/ 底下的相對路徑），沒有就只畫擺設
// - role：{ context 背景, me 我的角色, did 負責內容[], result 成果 }（沒有資料的欄位不寫，視窗中就不顯示那一列）
// - sections：[{ heading, items[] }] 補充條列
// - images：[{ src, caption, credit }]；video：{ src, caption, credit }

export const MUSEUM_TITLE = '承翰故事館';
const A = (f) => `assets/museum/${f}`;

export const ZONES = [
  { id: 'learning', title: '學習旅程', theme: '書桌、筆記與照片' },
  { id: 'education', title: '教育與地方探索', theme: '地圖、陶器、活動紀錄' },
  { id: 'digital', title: '互動遊戲與數位作品', theme: '電腦與作品入口' },
];

export const EXHIBITS = [
  // ================= 1. 學習旅程 =================
  {
    id: 'profile',
    zone: 'learning',
    prop: 'notebook',
    title: '自我介紹筆記',
    subtitle: '數位學習科技系｜用遊戲與科技，設計學習體驗',
    sections: [
      { heading: '關鍵字', items: ['嘉義人', 'I 人慢熟', '遊戲化設計', '實境解謎', '營隊隊輔', 'LINE OA', '戶外踏青', '愛看演唱會'] },
    ],
  },
  {
    id: 'growth',
    zone: 'learning',
    prop: 'notes',
    title: '學習收穫',
    subtitle: '從單點學習，到一路長出新技能',
    paragraphs: [
      '以前：把 AI 用在網頁開發，是一個獨立的點。',
      '上課後：學會完整 Prompt、生圖、影片、UI / UX，還能把 Excel 轉成網頁。',
      '重點不是一個作品，而是一路累積、不斷長出新技能的過程。',
    ],
    sections: [
      {
        heading: '三個具體收穫',
        items: [
          '完整 Prompt 做生圖與影片：把角色、場景、運鏡、風格交代完整，就能穩定做出想要的效果。',
          'Excel 轉網頁：把表格資料轉成可互動、可分享的網頁，資料不再只躺在表格裡。',
          '從工具到流程設計：重點不是學會單一功能，而是知道各個工具怎麼接在一起。',
        ],
      },
    ],
  },
  {
    id: 'hobbies',
    zone: 'learning',
    prop: 'photos',
    title: '我的興趣',
    subtitle: '看演唱會、戶外踏青、閱讀',
    thumb: A('hobby-concert.jpg'),
    thumb2: A('hobby-hiking.jpg'),
    images: [
      { src: A('hobby-concert.jpg'), caption: '看演唱會' },
      { src: A('hobby-hiking.jpg'), caption: '戶外踏青' },
      { src: A('book-1.png'), caption: '閱讀：《無路之路》' },
      { src: A('book-2.png'), caption: '閱讀：《納瓦爾寶典》' },
      { src: A('book-3.png'), caption: '閱讀：《一本書終結你的拖延症》（漫畫版）' },
    ],
  },

  // ================= 2. 教育與地方探索 =================
  {
    id: 'chiayi',
    zone: 'education',
    prop: 'map',
    title: '小城謎走 2.0',
    subtitle: '嘉義種種影像 × 第五屆有事青年節',
    thumb: A('chiayi-poster.webp'),
    role: {
      context: '專案參與：嘉義市巷弄中的實境解謎活動。',
      me: '負責 LINE OA 關卡建置。',
      did: ['把解謎關卡搭建在 LINE 官方帳號上。'],
    },
    sections: [
      { heading: '活動規模（引自簡報）', items: ['24 個站點', '40 隻原創角色', '活動期間 9 天（9/27 – 10/5）'] },
    ],
    images: [
      { src: A('chiayi-poster.webp'), caption: '活動海報', credit: '圖：嘉義市政府提供' },
      { src: A('chiayi-cards.jpg'), caption: '角色圖卡', credit: '圖：種種影像' },
      { src: A('chiayi-stationmaster.webp'), caption: '站長角色介紹', credit: '圖：嘉義市政府提供' },
    ],
  },
  {
    id: 'yingge',
    zone: 'education',
    prop: 'pottery',
    title: '鶯歌實境解謎',
    subtitle: '開發在地走讀的遊戲化關卡',
    thumb: A('yingge-poster.jpg'),
    role: {
      context: '新北市環境文教協會（見習）。',
      me: '開發鶯歌實境解謎遊戲。',
      did: ['開發在地走讀的遊戲化關卡。'],
    },
    images: [{ src: A('yingge-poster.jpg'), caption: '結尾宣傳圖', credit: '圖：新北市環境文教協會' }],
    video: { src: A('yingge-trailer.mp4'), caption: '鶯歌實境解謎影片' },
  },
  {
    id: 'camp',
    zone: 'education',
    prop: 'board',
    title: '營隊與環境教育',
    subtitle: '擔任隊輔，進行環境教育',
    thumb: A('camp-2.jpg'),
    thumb2: A('camp-1.jpg'),
    role: {
      context: '新北市環境文教協會（見習）。',
      me: '擔任隊輔。',
      did: ['帶孩子走進自然與在地場域。', '把環境知識變成能親身體驗的探索。'],
    },
    images: [
      { src: A('camp-1.jpg'), caption: '營隊現場照片（人物已模糊處理）' },
      { src: A('camp-2.jpg'), caption: '營隊現場照片（人物已模糊處理）' },
    ],
  },

  // ================= 3. 互動遊戲與數位作品 =================
  {
    id: 'platform',
    zone: 'digital',
    prop: 'computer',
    title: '遊戲化課室平台',
    subtitle: '把課堂變成一場 RPG 冒險',
    thumb: A('lab-platform-main.jpg'),
    role: {
      context: '研究所。',
      me: '開發遊戲化課室平台。',
      did: [
        'RPG 闖關：課堂任務設計成關卡，闖關累積等級。',
        '商城：完成任務賺取遊戲幣，到商城兌換獎勵。',
        '技能：角色成長與技能，讓學習看得見累積。',
      ],
    },
    images: [
      { src: A('lab-platform-main.jpg'), caption: '平台畫面：角色等級、遊戲幣與商城' },
      { src: A('lab-platform-shop.jpg'), caption: '商城示意圖：用遊戲幣兌換新角色' },
      { src: A('lab-platform-quiz.jpg'), caption: '闖關答題示意圖：答對即可發動攻擊' },
    ],
  },
  {
    id: 'add',
    zone: 'digital',
    prop: 'tablet',
    title: 'ADD 專注力提醒',
    subtitle: '分心時，圖像提醒拉回專注',
    thumb: A('lab-add-reminder.jpg'),
    role: {
      context: '研究所。',
      me: '簡報原文：「開發遊戲化課室平台，應用在 ADD 兒童的提醒與專注學習系統」。',
      did: ['對象：ADD 兒童，學習時容易分心。', '觸發：學生在學習中分心的時候。', '圖像提醒：傳送圖像到畫面，引導將注意力回到學習影片中。'],
    },
    images: [{ src: A('lab-add-reminder.jpg'), caption: '圖像提醒畫面：分心時彈出的鼓勵圖像' }],
  },
  {
    id: 'entry',
    zone: 'digital',
    prop: 'sign',
    title: '作品入口',
    subtitle: '作品連結與試玩入口',
    paragraphs: ['互動遊戲與數位作品的總覽，點選館內各展品可以看詳細介紹。'],
    sections: [{ heading: '館內相關展品', items: ['遊戲化課室平台（本展區）', 'ADD 專注力提醒（本展區）', '鶯歌實境解謎影片（教育與地方探索展區）', '小城謎走 2.0（教育與地方探索展區）'] }],
    links: [],
  },
];
