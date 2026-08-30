import { describe, expect, it } from "vitest";
import {
  classifyExclusion,
  extractAccountHolder,
  findHeaderRow,
  latestBalance,
  parseKakaoRows,
  summarizeKakao,
} from "../kakaobank-import";

/** 실제 카뱅 파일 형태를 축약한 픽스처 (메타 행 + 헤더 + 데이터). */
const SAMPLE: string[][] = [
  ["카카오뱅크 거래내역"],
  [],
  ["성명", "장희섭", "", "조회기간", "2026.07.27 - 2026.08.27"],
  ["계좌번호", "****-**-***8675"],
  ["※ 금액앞에 '-' 표시는 출금 금액입니다."],
  ["거래일시", "구분", "거래금액", "거래 후 잔액", "거래구분", "내용", "메모"],
  ["2026.07.27 12:15:07", "출금", "-403", "118,000", "저금통", "저금통", ""],
  ["2026.07.27 14:48:36", "입금", "50,000", "168,000", "일반입금", "장희섭", ""],
  ["2026.07.27 14:49:56", "출금", "-250,000", "218,000", "자동이체(기타)", "토스 장희섭", ""],
  ["2026.07.27 23:52:00", "출금", "-2,500", "213,500", "일반이체", "박강우", ""],
  ["2026.08.01 10:00:00", "출금", "-215,000", "100,000", "일반이체", "네이버페이결제", ""],
  ["", "", "", "", "", "", ""], // 빈 줄 → 건너뜀
];

describe("findHeaderRow", () => {
  it("'거래일시' 헤더행 인덱스를 찾는다", () => {
    expect(findHeaderRow(SAMPLE)).toBe(5);
  });
  it("헤더가 없으면 -1", () => {
    expect(findHeaderRow([["아무것도"], ["없음"]])).toBe(-1);
  });
});

describe("extractAccountHolder", () => {
  it("성명 라벨 옆 값을 뽑는다", () => {
    expect(extractAccountHolder(SAMPLE)).toBe("장희섭");
  });
  it("없으면 빈 문자열", () => {
    expect(extractAccountHolder([["계좌번호", "123"]])).toBe("");
  });
});

describe("classifyExclusion — 소비 제외 판정", () => {
  it("거래구분이 저금통이면 savings", () => {
    expect(classifyExclusion("저금통", "저금통", "장희섭")).toBe("savings");
  });
  it("내용이 저금통이어도 savings", () => {
    expect(classifyExclusion("저금통", "일반입금", "장희섭")).toBe("savings");
  });
  it("내용에 계좌주 성명이 포함되면 self-transfer (채널명 접두 포함)", () => {
    expect(classifyExclusion("토스 장희섭", "자동이체(기타)", "장희섭")).toBe(
      "self-transfer",
    );
    expect(classifyExclusion("장희섭", "일반입금", "장희섭")).toBe(
      "self-transfer",
    );
    expect(classifyExclusion("장희섭(블로디(Blogdy))", "일반이체", "장희섭")).toBe(
      "self-transfer",
    );
  });
  it("타인 이체·결제는 제외 안 함 (null)", () => {
    expect(classifyExclusion("박강우", "일반이체", "장희섭")).toBeNull();
    expect(classifyExclusion("네이버페이결제", "일반이체", "장희섭")).toBeNull();
  });
  it("별칭(다른 본인 계좌명)도 self-transfer로 잡는다", () => {
    expect(
      classifyExclusion("내비상금", "일반이체", "장희섭", ["내비상금"]),
    ).toBe("self-transfer");
  });
  it("성명이 비어 있으면 성명 기준 판정은 생략", () => {
    expect(classifyExclusion("장희섭", "일반이체", "")).toBeNull();
  });
});

describe("parseKakaoRows", () => {
  const drafts = parseKakaoRows(SAMPLE);

  it("헤더 아래 유효 행만 초안으로 만든다 (빈 줄 제외)", () => {
    expect(drafts).toHaveLength(5);
  });

  it("방향(입금/출금)을 구분 칸에서 읽는다", () => {
    const income = drafts.filter((d) => d.direction === "income");
    const expense = drafts.filter((d) => d.direction === "expense");
    expect(income).toHaveLength(1);
    expect(expense).toHaveLength(4);
  });

  it("금액은 항상 양수 정수", () => {
    expect(drafts.every((d) => d.amount > 0 && Number.isInteger(d.amount))).toBe(
      true,
    );
    const toss = drafts.find((d) => d.content === "토스 장희섭");
    expect(toss?.amount).toBe(250_000);
  });

  it("본인이체·저금통은 excluded=true, 타인/결제는 false", () => {
    const byContent = Object.fromEntries(drafts.map((d) => [d.content, d]));
    expect(byContent["저금통"]!.excludeReason).toBe("savings");
    expect(byContent["토스 장희섭"]!.excludeReason).toBe("self-transfer");
    expect(byContent["장희섭"]!.excludeReason).toBe("self-transfer"); // 입금이어도 본인이체면 제외
    expect(byContent["박강우"]!.excluded).toBe(false);
    expect(byContent["네이버페이결제"]!.excluded).toBe(false);
  });

  it("헤더가 없으면 빈 배열", () => {
    expect(parseKakaoRows([["잘못된"], ["파일"]])).toEqual([]);
  });

  it("학습 규칙(categoryByContent)이 키워드 추론보다 우선한다", () => {
    // '박강우'는 키워드로는 etc지만, 학습 규칙이 있으면 그 값을 쓴다
    const learned = parseKakaoRows(SAMPLE, {
      categoryByContent: { 박강우: "dining" },
    });
    const bkw = learned.find((d) => d.content === "박강우");
    expect(bkw?.category).toBe("dining");
    // 규칙 없는 내용은 여전히 키워드 추론
    const naver = learned.find((d) => d.content === "네이버페이결제");
    expect(naver?.category).toBe("shopping");
  });
});

describe("latestBalance — 현재 잔액 추출", () => {
  it("가장 최근 거래의 거래 후 잔액을 반환한다 (오름차순 파일)", () => {
    // SAMPLE 마지막 유효 거래(2026.08.01)의 잔액 = 100,000
    expect(latestBalance(parseKakaoRows(SAMPLE))).toBe(100_000);
  });

  it("내림차순 파일(최신이 위)이어도 최신 날짜의 잔액을 고른다", () => {
    const desc: string[][] = [
      ["성명", "장희섭"],
      ["거래일시", "구분", "거래금액", "거래 후 잔액", "거래구분", "내용", "메모"],
      ["2026.08.10 09:00:00", "출금", "-1,000", "500,000", "일반이체", "김철수", ""],
      ["2026.07.01 09:00:00", "입금", "10,000", "501,000", "일반입금", "박강우", ""],
    ];
    expect(latestBalance(parseKakaoRows(desc))).toBe(500_000);
  });

  it("잔액을 못 구하면 null", () => {
    expect(latestBalance([])).toBeNull();
  });
});

describe("summarizeKakao", () => {
  it("포함 지출·입금과 제외분을 분리 집계한다", () => {
    const s = summarizeKakao(parseKakaoRows(SAMPLE));
    // 포함 지출 = 박강우 2,500 + 네이버페이 215,000
    expect(s.expenseTotal).toBe(217_500);
    expect(s.includedExpenseCount).toBe(2);
    // 포함 입금 = 없음 (유일한 입금 '장희섭'은 본인이체로 제외)
    expect(s.incomeTotal).toBe(0);
    expect(s.includedIncomeCount).toBe(0);
    // 제외: 저금통 403(1건), 본인이체 = 토스250,000 + 장희섭50,000 = 300,000(2건)
    expect(s.excludedByReason.savings).toEqual({ total: 403, count: 1 });
    expect(s.excludedByReason["self-transfer"]).toEqual({
      total: 300_000,
      count: 2,
    });
  });
});
