/**
 * 카카오뱅크 입출금 통장 거래내역 임포트 (SPEC §3 기능 5 확장).
 * 카뱅 "거래내역" 엑셀을 재저장한 표(문자열 2차원 배열) → 분류된 거래 초안.
 *
 * 순수 함수만 둔다 (CLAUDE.md 규칙 2). 파일 읽기(SheetJS 등)는 이 파일 밖에서 한다.
 *
 * 핵심 판단: 입출금 통장 내역은 대부분이 "소비"가 아니라 "돈 옮김"이다.
 *  - 본인 명의 계좌 간 이체(예: 토스로 옮김)  → 소비 아님
 *  - 저금통(세이프박스) 입출금                → 저축, 소비 아님
 * 이 둘을 소비로 집계하면 목표 대비 페이스 판정(README)이 완전히 틀어지므로 제외한다.
 * 나머지 출금(페이 결제·사람 이체 등)만 지출로, 입금은 수입으로 남긴다.
 */
import { inferCategory, parseAmountWon, parseCsvDate } from "./csv-import";
import type { Category, Won } from "./types";

/** 카뱅 표의 고정 열 순서 (헤더행 "거래일시" 기준). */
export const KAKAO_COLUMNS = {
  date: 0, // 거래일시  "2026.07.27 12:15:07"
  direction: 1, // 구분      "입금" | "출금"
  amount: 2, // 거래금액   "-403" | "50,000"  (음수 = 출금)
  balance: 3, // 거래 후 잔액
  txType: 4, // 거래구분   "저금통" | "일반이체" | "오픈뱅킹" | "일반입금" | "자동이체(기타)" …
  content: 5, // 내용      상대방/적요  "토스 장희섭" | "네이버페이결제" | "박강우"
  memo: 6, // 메모
} as const;

/** 수입/지출 방향. 앱은 지출 중심이지만 사용자가 입금도 기록하길 원해 둘 다 남긴다. */
export type Direction = "income" | "expense";

/** 제외 사유. null이면 집계 대상(포함). */
export type ExcludeReason = "self-transfer" | "savings" | null;

/** 제외 사유 한국어 라벨 (UI 문자열은 상수 맵에 모은다 — CLAUDE.md 코드 스타일). */
export const EXCLUDE_REASON_LABELS_KO: Record<
  Exclude<ExcludeReason, null>,
  string
> = {
  "self-transfer": "본인이체",
  savings: "저금통",
};

/** 카뱅 한 행에서 뽑아낸 거래 초안. amount는 항상 양수, 방향은 direction으로 구분. */
export interface KakaoDraft {
  date: Date;
  direction: Direction;
  /** 금액(양수, 원 단위 정수). 출금도 양수로 두고 direction으로 구분 (CLAUDE.md 규칙 3). */
  amount: Won;
  /** 거래구분 원문 (저금통·오픈뱅킹 등) — 제외 판정과 사용자 검토에 쓴다. */
  txType: string;
  /** 내용(상대방/적요) 원문 — 카테고리 추론·본인이체 판정의 기준. */
  content: string;
  memo: string;
  /** 거래 후 잔액(참고용). 파싱 실패 시 null. */
  balance: Won | null;
  /** 지출일 때 추론 카테고리. 입금·제외 항목도 참고용으로 채워 둔다. */
  category: Category;
  /** 소비 집계에서 뺄지 여부 (본인이체·저금통). */
  excluded: boolean;
  /** 제외 사유 (excluded일 때만 non-null). */
  excludeReason: ExcludeReason;
}

/**
 * 표에서 실제 데이터 헤더행("거래일시"로 시작) 인덱스를 찾는다.
 * 카뱅 파일은 위에 성명·계좌번호·안내문 등 메타 행이 10줄 넘게 붙어 있어 고정 슬라이스가 불가능하다.
 * 못 찾으면 -1.
 */
export function findHeaderRow(rows: string[][]): number {
  return rows.findIndex((r) => (r[0] ?? "").trim() === "거래일시");
}

/**
 * 표 상단 메타 영역에서 계좌주 성명을 추출한다 (본인이체 판정에 필요).
 * "성명" 라벨이 있는 행의 다음 칸 값. 못 찾으면 빈 문자열.
 */
export function extractAccountHolder(rows: string[][]): string {
  for (const r of rows) {
    if ((r[0] ?? "").trim() === "성명") return (r[1] ?? "").trim();
  }
  return "";
}

/** 방향 판정: 구분 칸("입금"/"출금") 우선, 비어 있으면 금액 부호로 폴백. */
function resolveDirection(rawDirection: string, rawAmount: string): Direction {
  const d = rawDirection.trim();
  if (d === "입금") return "income";
  if (d === "출금") return "expense";
  // 폴백: 부호 (카뱅은 출금에 '-' 접두)
  return rawAmount.trim().startsWith("-") ? "expense" : "income";
}

/**
 * 이 거래를 소비 집계에서 제외할지 판정한다.
 * @param holder 계좌주 성명 (본인이체 판정 기준). 빈 문자열이면 성명 판정은 생략.
 * @param aliases 사용자의 다른 본인 계좌 별칭(선택) — content에 포함되면 본인이체로 본다.
 *
 * 왜 content 부분일치인가: 카뱅은 본인 이체를 "토스 장희섭"처럼 채널명+성명으로 남긴다.
 * 성명 완전일치만 보면 이런 행을 놓친다.
 */
export function classifyExclusion(
  content: string,
  txType: string,
  holder: string,
  aliases: string[] = [],
): ExcludeReason {
  const c = content.trim();

  // 저금통(세이프박스)은 저축이므로 소비 아님. 거래구분·내용 어느 쪽으로 와도 잡는다.
  if (txType.trim() === "저금통" || c === "저금통") return "savings";

  // 본인 명의 계좌 간 이체 — 성명 또는 사용자가 지정한 별칭이 내용에 포함되면 본인이체.
  const names = [holder, ...aliases].map((n) => n.trim()).filter(Boolean);
  if (names.some((n) => c.includes(n))) return "self-transfer";

  return null;
}

/** parseKakaoRows 옵션. */
export interface ParseKakaoOptions {
  /** 계좌주 성명. 생략 시 표에서 자동 추출 (extractAccountHolder). */
  accountHolder?: string;
  /** 본인 계좌 별칭(토스 닉네임 등). content에 포함되면 본인이체로 제외. */
  selfAliases?: string[];
  /**
   * 학습된 분류 규칙: 거래 내용(정확일치) → 카테고리.
   * 있으면 키워드 추론보다 우선한다 (사용자가 전에 직접 정한 분류를 재현).
   */
  categoryByContent?: Record<string, Category>;
}

/**
 * 카뱅 표 전체 → 거래 초안 배열.
 * 헤더행을 찾아 그 아래부터 파싱하고, 날짜·금액이 유효하지 않은 행은 건너뛴다.
 * 분류(제외 여부)까지 끝낸 상태로 돌려주며, 실제 저장/집계 여부는 호출부(UI)가 정한다.
 */
export function parseKakaoRows(
  rows: string[][],
  options: ParseKakaoOptions = {},
): KakaoDraft[] {
  const headerIdx = findHeaderRow(rows);
  if (headerIdx < 0) return [];

  const holder = options.accountHolder ?? extractAccountHolder(rows);
  const aliases = options.selfAliases ?? [];
  const learned = options.categoryByContent ?? {};

  const drafts: KakaoDraft[] = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i]!;
    const date = parseCsvDate(row[KAKAO_COLUMNS.date] ?? "");
    if (!date) continue; // 빈 줄·합계 줄 등
    const amount = parseAmountWon(row[KAKAO_COLUMNS.amount] ?? "");
    if (amount <= 0) continue;

    const rawAmount = row[KAKAO_COLUMNS.amount] ?? "";
    const direction = resolveDirection(
      row[KAKAO_COLUMNS.direction] ?? "",
      rawAmount,
    );
    const txType = (row[KAKAO_COLUMNS.txType] ?? "").trim();
    const content = (row[KAKAO_COLUMNS.content] ?? "").trim();
    const memo = (row[KAKAO_COLUMNS.memo] ?? "").trim();
    const balanceRaw = parseAmountWon(row[KAKAO_COLUMNS.balance] ?? "");

    const reason = classifyExclusion(content, txType, holder, aliases);

    drafts.push({
      date,
      direction,
      amount,
      txType,
      content,
      memo,
      balance: balanceRaw > 0 ? balanceRaw : null,
      // 학습된 규칙이 있으면 그걸 우선 적용 (사용자가 전에 정한 분류 재현).
      // 없으면 키워드 추론 — 카뱅 내용은 상대방명 위주라 대부분 'etc'로 떨어진다.
      category: learned[content] ?? inferCategory(content),
      excluded: reason !== null,
      excludeReason: reason,
    });
  }
  return drafts;
}

/**
 * 거래내역에서 현재 잔액을 추출한다 (온보딩 '현재 자산' 자동 채우기용).
 * 가장 최근 거래의 "거래 후 잔액"이 곧 현재 잔액이다.
 * 파일이 오름차순이든 내림차순이든 동작하도록 날짜가 가장 큰 행을 고른다
 * (같은 날짜면 파일에서 더 뒤에 온 행 = 그날 마지막 거래). 잔액이 없으면 null.
 */
export function latestBalance(drafts: KakaoDraft[]): Won | null {
  let best: KakaoDraft | null = null;
  for (const d of drafts) {
    if (d.balance == null) continue;
    if (!best || d.date.getTime() >= best.date.getTime()) best = d;
  }
  return best?.balance ?? null;
}

/** 한 배치 요약 — 미리보기·검증용. 금액은 원 단위 정수. */
export interface KakaoImportSummary {
  /** 포함(제외 안 된) 지출 합계 */
  expenseTotal: Won;
  /** 포함 입금 합계 */
  incomeTotal: Won;
  /** 제외 사유별 합계·건수 */
  excludedByReason: Record<
    Exclude<ExcludeReason, null>,
    { total: Won; count: number }
  >;
  includedExpenseCount: number;
  includedIncomeCount: number;
}

/** 초안 배열을 요약한다 (제외분과 포함분을 분리 집계). */
export function summarizeKakao(drafts: KakaoDraft[]): KakaoImportSummary {
  const summary: KakaoImportSummary = {
    expenseTotal: 0,
    incomeTotal: 0,
    excludedByReason: {
      "self-transfer": { total: 0, count: 0 },
      savings: { total: 0, count: 0 },
    },
    includedExpenseCount: 0,
    includedIncomeCount: 0,
  };

  for (const d of drafts) {
    if (d.excluded && d.excludeReason) {
      const bucket = summary.excludedByReason[d.excludeReason];
      bucket.total += d.amount;
      bucket.count += 1;
      continue;
    }
    if (d.direction === "expense") {
      summary.expenseTotal += d.amount;
      summary.includedExpenseCount += 1;
    } else {
      summary.incomeTotal += d.amount;
      summary.includedIncomeCount += 1;
    }
  }
  return summary;
}
