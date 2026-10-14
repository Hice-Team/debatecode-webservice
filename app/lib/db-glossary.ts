import type { Language } from './i18n';

// DB 콘텐츠 KO→다국어(EN, JA, ZH-CN, ZH-TW) 고정 용어사전.
// 문제 카테고리·태그·난이도·게시판·역할 등 정형화된 DB 데이터는
// 비용 없이 항상 즉시 정확한 다국어 표기를 제공한다.

export const DB_GLOSSARY: Record<string, Record<Language, string>> = {
  // 문제 카테고리
  '해시': { ko: '해시', en: 'Hash', ja: 'ハッシュ', 'zh-CN': '哈希表', 'zh-TW': '雜湊表' },
  '스택': { ko: '스택', en: 'Stack', ja: 'スタック', 'zh-CN': '栈', 'zh-TW': '堆疊' },
  '큐': { ko: '큐', en: 'Queue', ja: 'キュー', 'zh-CN': '队列', 'zh-TW': '佇列' },
  '힙': { ko: '힙', en: 'Heap', ja: 'ヒープ', 'zh-CN': '堆', 'zh-TW': '堆積' },
  '정렬': { ko: '정렬', en: 'Sorting', ja: 'ソート', 'zh-CN': '排序', 'zh-TW': '排序' },
  '탐색': { ko: '탐색', en: 'Search', ja: '探索', 'zh-CN': '搜索', 'zh-TW': '搜尋' },
  '완전탐색': { ko: '완전탐색', en: 'Brute Force', ja: '全探索', 'zh-CN': '暴力全排列', 'zh-TW': '暴力搜尋' },
  '이분탐색': { ko: '이분탐색', en: 'Binary Search', ja: '二分探索', 'zh-CN': '二分查找', 'zh-TW': '二分搜尋' },
  '그리디': { ko: '그리디', en: 'Greedy', ja: '貪欲法', 'zh-CN': '贪心算法', 'zh-TW': '貪婪演算法' },
  '그래프': { ko: '그래프', en: 'Graph', ja: 'グラフ', 'zh-CN': '图论', 'zh-TW': '圖論' },
  '트리': { ko: '트리', en: 'Tree', ja: '木構造', 'zh-CN': '树', 'zh-TW': '樹' },
  'DP': { ko: 'DP', en: 'DP', ja: 'DP', 'zh-CN': '动态规划', 'zh-TW': '動態規劃' },
  '동적계획법': { ko: '동적계획법', en: 'Dynamic Programming', ja: '動的計画法', 'zh-CN': '动态规划', 'zh-TW': '動態規劃' },
  '자료구조': { ko: '자료구조', en: 'Data Structures', ja: 'データ構造', 'zh-CN': '数据结构', 'zh-TW': '資料結構' },
  '문자열': { ko: '문자열', en: 'String', ja: '文字列', 'zh-CN': '字符串', 'zh-TW': '字串' },
  '구현': { ko: '구현', en: 'Implementation', ja: '実装', 'zh-CN': '模拟实现', 'zh-TW': '模擬實現' },
  '수학': { ko: '수학', en: 'Math', ja: '数学', 'zh-CN': '数学', 'zh-TW': '數學' },
  '재귀': { ko: '재귀', en: 'Recursion', ja: '再帰', 'zh-CN': '递归', 'zh-TW': '遞迴' },
  '백트래킹': { ko: '백트래킹', en: 'Backtracking', ja: 'バックトラッキング', 'zh-CN': '回溯', 'zh-TW': '回溯' },
  '시뮬레이션': { ko: '시뮬레이션', en: 'Simulation', ja: 'シミュレーション', 'zh-CN': '模拟', 'zh-TW': '模擬' },
  '투포인터': { ko: '투포인터', en: 'Two Pointers', ja: '2ポインタ', 'zh-CN': '双指针', 'zh-TW': '雙指針' },
  '슬라이딩윈도우': { ko: '슬라이딩윈도우', en: 'Sliding Window', ja: 'スライディングウィンドウ', 'zh-CN': '滑动窗口', 'zh-TW': '滑動視窗' },
  '비트마스크': { ko: '비트마스크', en: 'Bitmask', ja: 'ビットマスク', 'zh-CN': '位掩码', 'zh-TW': '位元遮罩' },
  '최단경로': { ko: '최단경로', en: 'Shortest Path', ja: '最短経路', 'zh-CN': '最短路径', 'zh-TW': '最短路徑' },
  '분할정복': { ko: '분할정복', en: 'Divide and Conquer', ja: '分割統治法', 'zh-CN': '分治法', 'zh-TW': '分治法' },

  // 난이도
  '입문': { ko: '입문', en: 'Beginner', ja: '入門', 'zh-CN': '入门', 'zh-TW': '入門' },
  '초급': { ko: '초급', en: 'Easy', ja: '初級', 'zh-CN': '简单', 'zh-TW': '初級' },
  '중급': { ko: '중급', en: 'Medium', ja: '中級', 'zh-CN': '中等', 'zh-TW': '中級' },
  '고급': { ko: '고급', en: 'Hard', ja: '上級', 'zh-CN': '困难', 'zh-TW': '進階' },

  // 문제집 세트 유형
  '기출 모음집': { ko: '기출 모음집', en: 'Past Exams', ja: '過去問コレクション', 'zh-CN': '企业真题集', 'zh-TW': '企業真題集' },
  '실전 모의고사': { ko: '실전 모의고사', en: 'Mock Test', ja: '実戦模試', 'zh-CN': '实战模拟考', 'zh-TW': '實戰模擬考' },
  '테마 문제집': { ko: '테마 문제집', en: 'Themed Set', ja: 'テーマ別問題集', 'zh-CN': '专项题集', 'zh-TW': '專項題組' },

  // 게시판
  '자유게시판': { ko: '자유게시판', en: 'Free Board', ja: '自由掲示板', 'zh-CN': '自由交流区', 'zh-TW': '自由交流區' },
  '공지사항': { ko: '공지사항', en: 'Notices', ja: 'お知らせ', 'zh-CN': '官方公告', 'zh-TW': '官方公告' },
  '멘토게시판': { ko: '멘토게시판', en: 'Mentor Board', ja: 'メンター掲示板', 'zh-CN': '导师指导区', 'zh-TW': '導師指導區' },
  '문의게시판': { ko: '문의게시판', en: 'Q&A Board', ja: 'お問い合わせ', 'zh-CN': '问题反馈区', 'zh-TW': '問題反饋區' },
  '중고게시판': { ko: '중고게시판', en: 'Marketplace', ja: 'マーケット', 'zh-CN': '二手交易区', 'zh-TW': '二手交易區' },
  '블로그': { ko: '블로그', en: 'Blog', ja: 'ブログ', 'zh-CN': '极客博客', 'zh-TW': '極客部落格' },
  '기타': { ko: '기타', en: 'Other', ja: 'その他', 'zh-CN': '其他', 'zh-TW': '其他' },

  // 기업명
  '카카오': { ko: '카카오', en: 'Kakao', ja: 'カカオ', 'zh-CN': 'Kakao', 'zh-TW': 'Kakao' },
  '삼성전자': { ko: '삼성전자', en: 'Samsung', ja: 'サムスン電子', 'zh-CN': '三星电子', 'zh-TW': '三星電子' },
  '현대자동차': { ko: '현대자동차', en: 'Hyundai Motor', ja: '現代自動車', 'zh-CN': '现代汽车', 'zh-TW': '現代汽車' },
  '토스': { ko: '토스', en: 'Toss', ja: 'トス', 'zh-CN': 'Toss', 'zh-TW': 'Toss' },
  '네이버': { ko: '네이버', en: 'Naver', ja: 'ネイバー', 'zh-CN': 'Naver', 'zh-TW': 'Naver' },
  '라인': { ko: '라인', en: 'LINE', ja: 'LINE', 'zh-CN': 'LINE', 'zh-TW': 'LINE' },
  '쿠팡': { ko: '쿠팡', en: 'Coupang', ja: 'クーパン', 'zh-CN': 'Coupang', 'zh-TW': 'Coupang' },
  '우아한형제들': { ko: '우아한형제들', en: 'Woowa Brothers', ja: '優雅な兄弟たち', 'zh-CN': 'Woowa', 'zh-TW': 'Woowa' },
  '당근': { ko: '당근', en: 'Karrot', ja: 'ニンジン', 'zh-CN': 'Karrot', 'zh-TW': 'Karrot' },

  // 역할
  '일반 사용자': { ko: '일반 사용자', en: 'Member', ja: '一般ユーザー', 'zh-CN': '普通用户', 'zh-TW': '一般使用者' },
  '문제 출제자': { ko: '문제 출제자', en: 'Problem Setter', ja: '出題者', 'zh-CN': '命题出题人', 'zh-TW': '命題出題人' },
  '검토자': { ko: '검토자', en: 'Reviewer', ja: '審査担当', 'zh-CN': '审题人', 'zh-TW': '審題人' },
  '최고 관리자': { ko: '최고 관리자', en: 'Administrator', ja: '最高管理者', 'zh-CN': '超级管理员', 'zh-TW': '超級管理員' },
  '디베이트메이트': { ko: '디베이트메이트', en: 'DebateMate', ja: 'ディベートメイト', 'zh-CN': '辩论伙伴', 'zh-TW': '辯論夥伴' },
  '협력사': { ko: '협력사', en: 'Partner', ja: 'パートナー', 'zh-CN': '合作方', 'zh-TW': '合作夥伴' },
  '관리자': { ko: '관리자', en: 'Admin', ja: '管理者', 'zh-CN': '管理员', 'zh-TW': '管理員' },
};

/** 사전에 있으면 지정된 언어로 고정 번역을, 없으면 null을 반환한다. */
export function glossaryLookup(text: string, lang: Language = 'en'): string | null {
  const item = DB_GLOSSARY[text.trim()];
  if (!item) return null;
  return item[lang] ?? item.en ?? null;
}
