/**
 * 사진 → 보유자산 추출 (서버 전용 — Anthropic Vision, CLAUDE.md 규칙 1·5·6).
 *
 * - 증권사·은행 앱 스크린샷에서 종목명·자산군·평가금액을 '읽어'온다.
 *   LLM은 화면에 이미 적힌 숫자를 읽을 뿐 계산하지 않는다(규칙 1).
 * - 결과는 도구(tool) 구조화 출력으로 받아 파싱 오류를 줄인다.
 * - ANTHROPIC_API_KEY는 서버에서만. 키 없으면 안내 메시지로 폴백(앱은 계속 동작).
 * - 추출 결과는 저장 전 사용자가 미리보기에서 확인·수정한다(정확도 보정).
 */
import Anthropic from "@anthropic-ai/sdk";

/** 추출된 보유자산 한 건 (저장 전 후보). 금액은 원 단위 정수. */
export interface ExtractedHolding {
  name: string;
  /** stock | fund | savings | bond | crypto | cash | other */
  assetClass: string;
  /** 화면에 표시된 평가금액(원). */
  amount: number;
  /** 야후 심볼(자신 있을 때만). 미리보기에서 사용자가 확인. */
  ticker?: string;
  /** 보유 수량(화면에 있을 때만). */
  quantity?: number;
}

export type VisionResult =
  | { ok: true; holdings: ExtractedHolding[] }
  | { ok: false; message: string };

const VALID_CLASSES = new Set([
  "stock",
  "fund",
  "savings",
  "bond",
  "crypto",
  "cash",
  "other",
]);

type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";
const VALID_MEDIA: Record<string, ImageMediaType> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/webp": "image/webp",
  "image/gif": "image/gif",
};

const SYSTEM_PROMPT = `당신은 증권사·은행 앱의 자산/잔고 스크린샷에서 보유 자산을 읽어내는 추출기입니다.
규칙:
- 화면에 실제로 보이는 값만 읽으세요. 직접 계산하거나 추정하지 마세요.
- 각 종목의 '평가금액'(원 단위)을 amount로 넣으세요. 콤마·'원'은 제거한 정수로.
- 화면에 원화 평가금액이 없고 외화만 있으면 그 종목은 건너뛰세요(환산은 앱이 따로 합니다).
- assetClass는 다음 중 하나로만 분류: stock(개별주식), fund(펀드·ETF), savings(예금·적금), bond(채권), crypto(암호화폐), cash(현금·파킹통장·CMA), other(그 외/불명).
- 종목 코드나 티커가 명확히 보이면 ticker에 넣되, 확실하지 않으면 비워두세요(지어내지 마세요).
- 보유 수량이 보이면 quantity에 넣으세요.
- 특정 상품·종목을 추천하거나 평가하지 마세요. 오직 화면의 사실만 추출합니다.`;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: "record_holdings",
  description: "스크린샷에서 읽어낸 보유 자산 목록을 기록한다.",
  input_schema: {
    type: "object",
    properties: {
      holdings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string", description: "종목/상품 이름" },
            assetClass: {
              type: "string",
              enum: [...VALID_CLASSES],
              description: "자산군 분류",
            },
            amount: {
              type: "number",
              description: "평가금액(원 단위 정수, 콤마 없이)",
            },
            ticker: {
              type: "string",
              description: "종목코드/티커(확실할 때만, 없으면 생략)",
            },
            quantity: {
              type: "number",
              description: "보유 수량(보일 때만, 없으면 생략)",
            },
          },
          required: ["name", "assetClass", "amount"],
        },
      },
    },
    required: ["holdings"],
  },
};

/** 'data:image/png;base64,...' 데이터 URL → { mediaType, base64 }. */
function parseDataUrl(
  dataUrl: string,
): { mediaType: ImageMediaType; base64: string } | null {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl);
  if (!m) return null;
  const mediaType = VALID_MEDIA[m[1]!.toLowerCase()];
  if (!mediaType) return null;
  return { mediaType, base64: m[2]! };
}

/**
 * 사진에서 보유자산 추출. 저장은 하지 않고 후보 목록만 반환한다.
 * 키가 없거나 실패하면 ok:false로 안내(앱은 계속 동작).
 */
export async function extractHoldingsFromImage(
  dataUrl: string,
): Promise<VisionResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return {
      ok: false,
      message:
        "사진 인식이 연결되지 않았어요. (서버에 ANTHROPIC_API_KEY를 설정하면 사용할 수 있어요.)",
    };
  }

  const parsed = parseDataUrl(dataUrl);
  if (!parsed) {
    return { ok: false, message: "지원하지 않는 이미지 형식이에요. (JPG·PNG·WebP)" };
  }

  try {
    const client = new Anthropic();
    const resp = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      // 도구를 반드시 쓰게 강제 — 구조화 출력만 받는다.
      tool_choice: { type: "tool", name: "record_holdings" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: {
                type: "base64",
                media_type: parsed.mediaType,
                data: parsed.base64,
              },
            },
            {
              type: "text",
              text: "이 화면의 보유 자산을 record_holdings 도구로 기록해줘.",
            },
          ],
        },
      ],
    });

    const toolUse = resp.content.find(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );
    if (!toolUse) {
      return { ok: false, message: "사진에서 자산 정보를 찾지 못했어요." };
    }

    const raw = (toolUse.input as { holdings?: unknown }).holdings;
    if (!Array.isArray(raw)) {
      return { ok: false, message: "사진에서 자산 정보를 찾지 못했어요." };
    }

    const holdings = raw
      .map(sanitize)
      .filter((h): h is ExtractedHolding => h !== null);

    if (holdings.length === 0) {
      return {
        ok: false,
        message: "인식된 자산이 없어요. 잔고·보유종목 화면을 더 선명하게 찍어보세요.",
      };
    }
    return { ok: true, holdings };
  } catch {
    return {
      ok: false,
      message: "사진 인식 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.",
    };
  }
}

/** 모델 출력을 신뢰하지 않고 방어적으로 정리 — 금액 정수화, 자산군 화이트리스트. */
function sanitize(v: unknown): ExtractedHolding | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const name = String(o.name ?? "").trim();
  const amount = Math.max(0, Math.round(Number(o.amount)));
  if (!name || !Number.isFinite(amount)) return null;
  const assetClass = VALID_CLASSES.has(String(o.assetClass))
    ? String(o.assetClass)
    : "other";
  const ticker =
    typeof o.ticker === "string" && o.ticker.trim()
      ? o.ticker.trim()
      : undefined;
  const quantity =
    Number.isFinite(Number(o.quantity)) && Number(o.quantity) > 0
      ? Number(o.quantity)
      : undefined;
  return { name, assetClass, amount, ticker, quantity };
}
