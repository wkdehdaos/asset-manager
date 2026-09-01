/**
 * 야후 파이낸스 시세 조회 (서버 전용 — 네트워크 의존, core에 두지 않는다).
 *
 * - 무료·비공식 엔드포인트라 키가 필요 없다. 국내 주식은 약 15~20분 지연될 수 있다.
 * - 60초 메모리 캐시로 호출을 줄인다(개인 앱이라 이 정도면 충분, 레이트리밋 회피).
 * - 실패하면 null을 반환한다 — 시세를 못 가져와도 앱은 캐시된 평가액으로 계속 돈다.
 * - 곱셈(평가액 환산)은 여기서 하지 않는다. core/holding-valuation.ts가 담당(규칙 1).
 */

export interface Quote {
  /** 야후 심볼 (예: 005930.KS, AAPL, BTC-USD). */
  symbol: string;
  /** 현재가 (시세 통화 기준). */
  price: number;
  /** 시세 통화 (KRW·USD 등). USD면 환율로 원화 환산이 필요하다. */
  currency: string;
  /** 전일 종가 — 등락 표시용. 없으면 null. */
  previousClose: number | null;
}

const CACHE_TTL_MS = 15_000;
type CacheEntry = { quote: Quote | null; at: number };
const cache = new Map<string, CacheEntry>();

const YAHOO_BASE = "https://query1.finance.yahoo.com/v8/finance/chart/";

/** 사용자가 넣은 티커를 야후 심볼로 가볍게 정규화한다. */
export function normalizeTicker(raw: string, assetClass: string): string {
  const s = raw.trim().toUpperCase();
  if (!s) return s;
  // 암호화폐는 야후에서 'BTC-USD' 형식 — 통화 접미사가 없으면 USD를 붙인다.
  if (assetClass === "crypto" && !s.includes("-")) return `${s}-USD`;
  // 국내 주식 6자리 숫자만 온 경우: KOSPI/KOSDAQ(.KS/.KQ)를 자동판별할 수 없어
  // 그대로 둔다. UI에서 '005930.KS'처럼 전체 심볼을 안내한다.
  return s;
}

/**
 * 단일 심볼 시세. 실패·미존재면 null.
 * 차트 엔드포인트(meta)를 쓴다 — quote 엔드포인트보다 인증 없이 안정적이다.
 */
export async function fetchQuote(symbol: string): Promise<Quote | null> {
  const key = symbol.trim();
  if (!key) return null;

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.quote;

  try {
    const url = `${YAHOO_BASE}${encodeURIComponent(key)}?range=1d&interval=1d`;
    const res = await fetch(url, {
      // 야후는 UA 없는 요청을 종종 막는다.
      headers: { "User-Agent": "Mozilla/5.0" },
      // Next 서버 fetch 캐시는 쓰지 않는다 — 우리 메모리 캐시로 신선도를 직접 관리.
      cache: "no-store",
    });
    if (!res.ok) {
      cache.set(key, { quote: null, at: Date.now() });
      return null;
    }
    const json = (await res.json()) as YahooChartResponse;
    const meta = json?.chart?.result?.[0]?.meta;
    const price = meta?.regularMarketPrice;
    if (typeof price !== "number" || !Number.isFinite(price)) {
      cache.set(key, { quote: null, at: Date.now() });
      return null;
    }
    // 야후 차트 meta는 전일종가를 chartPreviousClose로 준다(previousClose는 없을 때가 많음).
    const prev =
      typeof meta?.chartPreviousClose === "number"
        ? meta.chartPreviousClose
        : typeof meta?.previousClose === "number"
          ? meta.previousClose
          : null;
    const quote: Quote = {
      symbol: key,
      price,
      currency: meta?.currency ?? "KRW",
      previousClose: prev,
    };
    cache.set(key, { quote, at: Date.now() });
    return quote;
  } catch {
    cache.set(key, { quote: null, at: Date.now() });
    return null;
  }
}

/** 여러 심볼을 병렬 조회. */
export async function fetchQuotes(
  symbols: string[],
): Promise<Map<string, Quote>> {
  const uniq = [...new Set(symbols.map((s) => s.trim()).filter(Boolean))];
  const results = await Promise.all(uniq.map((s) => fetchQuote(s)));
  const map = new Map<string, Quote>();
  results.forEach((q, i) => {
    if (q) map.set(uniq[i]!, q);
  });
  return map;
}

/** USD→KRW 환율. 실패하면 null (호출 측이 USD 종목 갱신을 건너뛴다). */
export async function fetchUsdKrw(): Promise<number | null> {
  const q = await fetchQuote("USDKRW=X");
  return q && q.price > 0 ? q.price : null;
}

// ── 야후 응답 타입(필요한 필드만) ──────────────────────────────────────────
interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: {
        regularMarketPrice?: number;
        previousClose?: number;
        chartPreviousClose?: number;
        currency?: string;
      };
    }>;
  };
}
