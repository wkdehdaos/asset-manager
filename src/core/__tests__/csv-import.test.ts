import { describe, expect, it } from "vitest";
import {
  buildDrafts,
  inferCategory,
  markDuplicates,
  parseAmountWon,
  parseCsv,
  parseCsvDate,
  transactionKey,
} from "../csv-import";

describe("parseCsv", () => {
  it("기본 행/열을 분리한다", () => {
    expect(parseCsv("a,b,c\n1,2,3")).toEqual([
      ["a", "b", "c"],
      ["1", "2", "3"],
    ]);
  });
  it("따옴표로 감싼 필드 안의 쉼표를 보존한다", () => {
    expect(parseCsv('날짜,가맹점,금액\n2026-08-01,"스타벅스, 강남점","4,500"')).toEqual([
      ["날짜", "가맹점", "금액"],
      ["2026-08-01", "스타벅스, 강남점", "4,500"],
    ]);
  });
  it('"" 이스케이프를 처리한다', () => {
    expect(parseCsv('"a""b",c')).toEqual([['a"b', "c"]]);
  });
  it("CRLF 개행과 마지막 개행을 처리한다", () => {
    expect(parseCsv("a,b\r\n1,2\r\n")).toEqual([
      ["a", "b"],
      ["1", "2"],
    ]);
  });
});

describe("inferCategory — 가맹점 키워드 추론", () => {
  it.each([
    ["스타벅스 강남", "dining"],
    ["이마트 성수점", "food"],
    ["카카오T 택시", "transport"],
    ["넷플릭스", "subscription"],
    ["CGV 왕십리", "leisure"],
    ["올리브영", "shopping"],
    ["처음보는가맹점", "etc"],
  ])("%s → %s", (merchant, expected) => {
    expect(inferCategory(merchant)).toBe(expected);
  });
});

describe("parseAmountWon", () => {
  it("쉼표·통화기호를 제거하고 정수로", () => {
    expect(parseAmountWon("12,340원")).toBe(12_340);
    expect(parseAmountWon("₩4,500")).toBe(4_500);
  });
  it("음수(환불 등)는 절대값으로", () => {
    expect(parseAmountWon("-5,000")).toBe(5_000);
  });
  it("숫자가 없으면 0", () => {
    expect(parseAmountWon("승인취소")).toBe(0);
  });
});

describe("parseCsvDate", () => {
  it("다양한 구분자를 처리한다", () => {
    expect(parseCsvDate("2026.08.27")?.getFullYear()).toBe(2026);
    expect(parseCsvDate("2026/8/1")?.getMonth()).toBe(7); // 8월 = index 7
    expect(parseCsvDate("2026-08-27")?.getDate()).toBe(27);
  });
  it("파싱 불가면 null", () => {
    expect(parseCsvDate("날짜없음")).toBeNull();
  });
});

describe("buildDrafts", () => {
  const rows = [
    ["날짜", "가맹점", "금액"],
    ["2026-08-01", "스타벅스", "4,500"],
    ["2026.08.03", "이마트", "53,200"],
    ["", "깨진행", "1000"], // 날짜 없음 → 건너뜀
    ["2026-08-05", "승인취소가맹점", "0"], // 금액 0 → 건너뜀
  ];
  const mapping = { date: 0, merchant: 1, amount: 2 };

  it("헤더를 건너뛰고 유효한 행만 초안으로 만든다", () => {
    const drafts = buildDrafts(rows, mapping, true);
    expect(drafts).toHaveLength(2);
    expect(drafts[0]).toMatchObject({ amount: 4_500, category: "dining" });
    expect(drafts[1]).toMatchObject({ amount: 53_200, category: "food" });
  });
});

describe("markDuplicates — 중복 감지 (날짜+금액)", () => {
  const d = (day: number, amount: number) => ({
    date: new Date(2026, 7, day),
    amount,
  });

  it("기존 거래와 겹치면 duplicate=true", () => {
    const existing = new Set([transactionKey(new Date(2026, 7, 1), 4_500)]);
    const marked = markDuplicates([d(1, 4_500), d(2, 9_000)], existing);
    expect(marked[0]!.duplicate).toBe(true);
    expect(marked[1]!.duplicate).toBe(false);
  });

  it("배치 내 중복은 두 번째부터 표시한다", () => {
    const marked = markDuplicates([d(1, 4_500), d(1, 4_500)]);
    expect(marked[0]!.duplicate).toBe(false);
    expect(marked[1]!.duplicate).toBe(true);
  });
});
