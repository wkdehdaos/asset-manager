/**
 * CSV 임포트 로직 (SPEC §3 기능 5, PROMPTS STEP 7).
 * 카드사 명세서 CSV → 거래 초안. 순수 함수라 UI 없이 테스트할 수 있다.
 *
 * - parseCsv: 따옴표·쉼표 처리하는 최소 CSV 파서
 * - inferCategory: 가맹점명 키워드로 카테고리 추측 (사용자가 수정 가능)
 * - markDuplicates: 날짜+금액 기준 중복 감지 (DB 기존분 + 배치 내 중복)
 */
import type { Category, Won } from "./types";

/** 열을 어느 필드로 쓸지 지정 (열 인덱스). */
export interface CsvColumnMapping {
  date: number;
  amount: number;
  merchant: number;
}

/** CSV에서 뽑아낸 거래 초안. */
export interface DraftTransaction {
  date: Date;
  amount: Won;
  merchant: string;
  category: Category;
}

/**
 * 최소 CSV 파서. 따옴표로 감싼 필드 안의 쉼표·개행, `""` 이스케이프를 처리한다.
 * (외부 의존성 없이 core 순수성을 지키기 위해 직접 구현)
 */
export function parseCsv(text: string): string[][] {
  const s = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += c;
    }
  }
  // 마지막 줄 (개행으로 끝나지 않은 경우)
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * 가맹점명 → 카테고리 추론용 키워드.
 * 위에 있는 카테고리가 우선. 상품 추천이 아니라 '분류'를 위한 가맹점 키워드다.
 */
export const CATEGORY_KEYWORDS: [Category, string[]][] = [
  ["dining", ["식당", "카페", "커피", "스타벅스", "이디야", "투썸", "빽다방", "컴포즈", "메가커피", "배달", "배민", "요기요", "쿠팡이츠", "맥도날드", "버거", "롯데리아", "맘스터치", "서브웨이", "kfc", "치킨", "피자", "김밥", "분식", "떡볶이", "베이커리", "제과", "파리바게", "뚜레쥬르", "돈까스", "돈가스", "국밥", "국수", "쌀국수", "라멘", "우동", "스시", "초밥", "파스타", "삼겹", "고깃집", "곱창", "막창", "족발", "보쌈", "포차", "호프", "주점", "술집", "이자카야", "마라", "훠궈", "도시락"]],
  ["food", ["마트", "이마트", "홈플러스", "롯데마트", "노브랜드", "하나로마트", "코스트코", "트레이더스", "편의점", "gs25", "cu", "세븐일레븐", "이마트24", "미니스톱", "슈퍼", "정육", "청과", "수산"]],
  ["transport", ["택시", "카카오t", "타다", "쏘카", "그린카", "렌터카", "지하철", "버스", "티머니", "캐시비", "대중교통", "주유", "주유소", "칼텍스", "sk에너지", "gs칼텍스", "s-oil", "하이패스", "코레일", "ktx", "srt", "철도", "톨게이트", "주차"]],
  ["utilities", ["도시가스", "수도", "전기", "한국전력", "한전", "관리비고지"]],
  ["communication", ["skt", "kt", "lg유플러스", "유플러스", "통신", "알뜰폰", "헬로모바일", "인터넷요금"]],
  ["insurance", ["보험", "생명", "화재해상", "손해보험", "실손", "메리츠", "삼성화재", "현대해상", "db손해"]],
  ["healthcare", ["병원", "약국", "의원", "치과", "한의원", "클리닉", "정형외과", "피부과", "안과", "내과"]],
  ["shopping", ["쿠팡", "11번가", "지마켓", "g마켓", "옥션", "네이버페이", "페이코", "무신사", "29cm", "지그재그", "에이블리", "브랜디", "알리", "테무", "백화점", "아울렛", "올리브영", "다이소", "이케아", "생활용품"]],
  ["subscription", ["넷플릭스", "유튜브", "youtube", "스포티파이", "멜론", "지니뮤직", "왓챠", "디즈니", "티빙", "웨이브", "쿠팡와우", "구독", "chatgpt", "openai", "icloud", "apple.com", "구글원", "아마존프라임"]],
  ["housing", ["월세", "관리비", "부동산", "임대", "전세", "보증금"]],
  ["education", ["학원", "서점", "교보문고", "영풍문고", "yes24", "알라딘", "인터넷강의", "인강", "온라인강의", "클래스101", "인프런", "강의료", "수강료"]],
  ["leisure", ["영화", "cgv", "메가박스", "롯데시네마", "노래방", "pc방", "헬스", "피트니스", "골프", "볼링", "스크린골프", "찜질방", "사우나", "스팀", "플레이스테이션", "닌텐도", "놀이공원", "에버랜드", "롯데월드"]],
];

/** 가맹점명으로 카테고리를 추측한다. 매칭 없으면 'etc'. */
export function inferCategory(merchant: string): Category {
  const lower = merchant.toLowerCase();
  for (const [category, keywords] of CATEGORY_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k.toLowerCase()))) return category;
  }
  return "etc";
}

/** "12,340원" · "-5,000" 같은 문자열에서 금액(정수)만 뽑아 절대값으로. */
export function parseAmountWon(raw: string): Won {
  const n = Number(raw.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.abs(Math.round(n)) : 0;
}

/** "2026.08.27" · "2026/8/1" · "2026-08-27" 등을 Date로. 실패하면 null. */
export function parseCsvDate(raw: string): Date | null {
  const t = raw.trim().replace(/[./]/g, "-");
  const m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * 파싱된 행 → 거래 초안. 헤더 행과 날짜·금액이 유효하지 않은 행은 건너뛴다.
 */
export function buildDrafts(
  rows: string[][],
  mapping: CsvColumnMapping,
  hasHeader: boolean,
): DraftTransaction[] {
  const body = hasHeader ? rows.slice(1) : rows;
  const drafts: DraftTransaction[] = [];
  for (const row of body) {
    const date = parseCsvDate(row[mapping.date] ?? "");
    if (!date) continue;
    const amount = parseAmountWon(row[mapping.amount] ?? "");
    if (amount <= 0) continue;
    const merchant = (row[mapping.merchant] ?? "").trim();
    drafts.push({ date, amount, merchant, category: inferCategory(merchant) });
  }
  return drafts;
}

/** 중복 감지 키: 같은 날(YYYY-MM-DD) + 같은 금액. */
export function transactionKey(date: Date, amount: Won): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}|${amount}`;
}

/**
 * 중복 표시. 기존 거래(existingKeys)와 겹치거나, 배치 내에서 앞선 행과 겹치면 true.
 */
export function markDuplicates<T extends { date: Date; amount: Won }>(
  drafts: T[],
  existingKeys: Set<string> = new Set(),
): (T & { duplicate: boolean })[] {
  const seen = new Set(existingKeys);
  return drafts.map((d) => {
    const key = transactionKey(d.date, d.amount);
    const duplicate = seen.has(key);
    if (!duplicate) seen.add(key);
    return { ...d, duplicate };
  });
}
