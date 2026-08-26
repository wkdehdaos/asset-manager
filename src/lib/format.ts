/** 표시용 포맷 유틸 — 계산이 아니라 '표시 직전' 변환만 담당 (CLAUDE.md 규칙 3). */

/** 원 단위 정수를 한국식 그룹 표기로. */
export function formatWon(n: number): string {
  return Math.round(n).toLocaleString("ko-KR");
}

/** "3,500,000" · "3500000원" 같은 입력에서 정수만 뽑는다. */
export function parseWon(s: string): number {
  const n = Number(s.replace(/[^\d-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

/** 소수 비율(0.238)을 퍼센트 문자열("23.8%")로. */
export function formatPct(rate: number, digits = 1): string {
  return `${(rate * 100).toFixed(digits)}%`;
}

/** 큰 금액을 "1억 2,340만원" 같은 한국식 축약으로. */
export function formatWonKorean(n: number): string {
  const won = Math.round(n);
  if (won === 0) return "0원";
  const sign = won < 0 ? "-" : "";
  let v = Math.abs(won);
  const eok = Math.floor(v / 100_000_000);
  v %= 100_000_000;
  const man = Math.floor(v / 10_000);
  const rest = v % 10_000;
  const parts: string[] = [];
  if (eok > 0) parts.push(`${eok.toLocaleString("ko-KR")}억`);
  if (man > 0) parts.push(`${man.toLocaleString("ko-KR")}만`);
  if (rest > 0 || parts.length === 0) parts.push(`${rest.toLocaleString("ko-KR")}`);
  return `${sign}${parts.join(" ")}원`;
}
