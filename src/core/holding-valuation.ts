/**
 * 보유 자산의 실시간 평가액 계산 (순수 함수만 — CLAUDE.md 규칙 2).
 * 시세·환율은 네트워크로 가져오는 값이라 여기서 직접 조회하지 않고 인자로 주입받는다.
 * 금액은 원 단위 정수로 반올림 (규칙 3). 곱셈은 코드가 한다 — LLM에게 시키지 않는다 (규칙 1).
 */
import type { Won } from "./types";

/**
 * 원화 평가액 = 수량 × 시세 × (시세통화→원 환율).
 * KRW 종목이면 fxRateToKrw = 1. USD 종목이면 USD/KRW 환율을 넘긴다.
 * 화면 표시 직전이 아니라 여기서 정수화하는 이유: 이 값이 그대로 DB(amount)에 캐시되고
 * 포트폴리오 합산·비중 계산에 쓰이므로 부동소수점 오차가 누적되면 안 된다.
 */
export function marketValueKrw(
  quantity: number,
  price: number,
  fxRateToKrw: number,
): Won {
  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(price) ||
    !Number.isFinite(fxRateToKrw)
  ) {
    return 0;
  }
  // 음수 수량·가격은 데이터 오류 — 0으로 막는다 (포트폴리오 총액 오염 방지).
  if (quantity <= 0 || price <= 0 || fxRateToKrw <= 0) return 0;
  return Math.round(quantity * price * fxRateToKrw);
}

/**
 * 전일 대비 등락률(%). = (현재가 − 전일종가) / 전일종가 × 100, 소수 둘째자리.
 * 전일종가가 없거나 0이면 계산 불가 → null.
 * 통화·환율과 무관하다(같은 통화 안의 비율) — 환산 없이 그대로 쓴다.
 */
export function dailyChangePct(
  price: number,
  previousClose: number | null,
): number | null {
  if (
    previousClose === null ||
    !Number.isFinite(price) ||
    !Number.isFinite(previousClose) ||
    previousClose <= 0
  ) {
    return null;
  }
  return Math.round(((price - previousClose) / previousClose) * 10000) / 100;
}
