/**
 * 구매력·실질수익률 계산 (SPEC 확장 — 기준율 대비 자산 가치 유지 판정).
 *
 * "자산이 몇 % 이상이어야 안 떨어지는가"에 답한다.
 * 답의 하한선은 곧 기준율 그 자체이고, 기준율을 넘는 정도가 실질 증가분이다.
 *
 * 순수 함수. 기준율(물가상승률·기준금리)은 수시로 바뀌므로 하드코딩하지 않고
 * 인자로 주입받는다 (CLAUDE.md 규칙 2).
 */
import type { BenchmarkRate, PreservationCheck, Rate } from "./types";

/**
 * 기본 기준율 — 어디까지나 '가정치'다. 실제 값은 앱 설정/사용자 입력에서
 * 주입하는 것을 권장한다(한국은행 기준금리·물가상승률은 자주 바뀐다).
 */
export const DEFAULT_BENCHMARKS: readonly BenchmarkRate[] = [
  { key: "inflation", label: "물가상승률", rate: 0.02 },
  { key: "baseRate", label: "기준금리", rate: 0.025 },
] as const;

/** breakeven으로 볼 실질수익률 허용 오차(±0.05%p). */
const BREAKEVEN_EPSILON = 0.0005;

/**
 * 피셔 방정식 실질수익률.
 * 실질수익률 = (1 + 명목수익률) / (1 + 기준율) − 1
 * (단순히 명목−기준으로 빼지 않는 이유: 복리 구조라 분수로 보정해야 정확하다)
 */
export function realReturn(nominalReturn: Rate, referenceRate: Rate): Rate {
  return (1 + nominalReturn) / (1 + referenceRate) - 1;
}

/**
 * 자산이 (해당 기준에서) 안 떨어지려면 넘어야 하는 명목수익률 하한선.
 * 곧 기준율 그 자체다. 명시적으로 함수로 두어 호출부 의도를 드러낸다.
 */
export function preservationThreshold(referenceRate: Rate): Rate {
  return referenceRate;
}

/** 명목수익률을 기준율 하나와 비교해 실질 유지 여부를 판정한다. */
export function checkPreservation(
  nominalReturn: Rate,
  benchmark: BenchmarkRate,
): PreservationCheck {
  const real = realReturn(nominalReturn, benchmark.rate);
  const thresholdPct = Math.round(benchmark.rate * 1000) / 10;
  const realPct = Math.round(real * 1000) / 10;

  let status: PreservationCheck["status"];
  let message: string;
  if (real > BREAKEVEN_EPSILON) {
    status = "growing";
    message = `${benchmark.label}(${thresholdPct}%)를 넘어 실질 자산이 연 ${realPct}% 늘어납니다.`;
  } else if (real < -BREAKEVEN_EPSILON) {
    status = "shrinking";
    // 얼마나 더 벌어야 본전인지 함께 알려준다(다그치지 않고 다음 행동 제시)
    const gapPct = Math.round((benchmark.rate - nominalReturn) * 1000) / 10;
    message = `${benchmark.label}(${thresholdPct}%)에 못 미쳐 실질 자산이 연 ${Math.abs(realPct)}% 줄어듭니다. 최소 ${thresholdPct}%(약 +${gapPct}%p) 이상이면 가치를 지킵니다.`;
  } else {
    status = "breakeven";
    message = `${benchmark.label}(${thresholdPct}%) 수준으로 실질 자산 가치를 유지합니다.`;
  }

  return {
    benchmark: benchmark.key,
    label: benchmark.label,
    thresholdReturn: benchmark.rate,
    nominalReturn,
    realReturn: real,
    status,
    message,
  };
}

/**
 * 여러 기준율(물가상승률·기준금리 등)에 대해 한 번에 판정한다.
 * 기본값을 쓰려면 DEFAULT_BENCHMARKS를 넘긴다.
 */
export function checkPreservationAll(
  nominalReturn: Rate,
  benchmarks: readonly BenchmarkRate[] = DEFAULT_BENCHMARKS,
): PreservationCheck[] {
  return benchmarks.map((b) => checkPreservation(nominalReturn, b));
}
