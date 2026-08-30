"use server";

/**
 * 스프레드시트 파일을 서버(로컬)에서 행 배열로 변환하는 액션.
 * 카카오뱅크 원본은 비밀번호로 암호화된 구형 xls라 브라우저에서 못 연다 —
 * 여기서 비번으로 해독한 뒤 파싱한다. 로컬 앱이라 파일이 밖으로 나가지 않는다.
 *
 * 반환값은 순수 문자열 2차원 배열(JSON 안전). 실제 거래 분류는 클라이언트에서
 * core의 parseKakaoRows로 한다 (분류 로직 한 곳 유지).
 */
import * as XLSX from "xlsx";
import * as officeCrypto from "officecrypto-tool";

export type ParseResult =
  | { ok: true; rows: string[][] }
  | {
      ok: false;
      reason: "password_required" | "password_wrong" | "read_error";
      message: string;
    };

export async function readSpreadsheetRows(
  formData: FormData,
): Promise<ParseResult> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, reason: "read_error", message: "파일이 없어요." };
  }
  const password =
    (formData.get("password") as string | null)?.trim() || undefined;

  // Uint8Array로 다룬다 — officecrypto(Buffer)와 XLSX(array) 양쪽에 넘기기 쉽다.
  let data: Uint8Array = new Uint8Array(await file.arrayBuffer());

  try {
    if (officeCrypto.isEncrypted(Buffer.from(data))) {
      if (!password) {
        return {
          ok: false,
          reason: "password_required",
          message: "이 파일은 비밀번호가 걸려 있어요. 비번을 입력해 주세요.",
        };
      }
      try {
        data = await officeCrypto.decrypt(Buffer.from(data), { password });
      } catch {
        return {
          ok: false,
          reason: "password_wrong",
          message: "비밀번호가 올바르지 않아요. 다시 확인해 주세요.",
        };
      }
    }

    const wb = XLSX.read(data, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]!];
    if (!ws) {
      return { ok: false, reason: "read_error", message: "빈 파일이에요." };
    }
    const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
      header: 1,
      defval: "",
      raw: false,
    });
    return { ok: true, rows };
  } catch (e) {
    return {
      ok: false,
      reason: "read_error",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}
