// 公告欄委託（內容與獎勵集中管理）
// need：需要交付的物品 { 物品 id: 數量 }
// reward：{ coins, tokens, items: { id: 數量 } }
// 狀態：available（可接受）→ accepted（進行中）→ done（已完成並領獎，不可重複）
export const QUESTS = [
  {
    id: 'q_fish_soup',
    title: '鄰居想煮魚湯',
    text: '住在緣側民宅的奶奶想煮一鍋魚湯，請幫忙釣兩條金色小鯽魚。',
    need: { fish_crucian: 2 },
    reward: { coins: 60 },
  },
  {
    id: 'q_tea_cabbage',
    title: '茶屋的醃菜',
    text: '茶屋老闆想做醃高麗菜，需要一顆新鮮的高麗菜。',
    need: { veg_cabbage: 1 },
    reward: { items: { bait_premium: 3 } },
  },
  {
    id: 'q_ayu',
    title: '想看看香魚',
    text: '村口的孩子想看看香魚長什麼樣子，釣到一條就拿來公告欄吧。',
    need: { fish_ayu: 1 },
    reward: { tokens: 2, coins: 20 },
  },
];
