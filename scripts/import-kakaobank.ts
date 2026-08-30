/**
 * 카카오뱅크 거래내역 파일을 DB로 임포트하는 CLI.
 * UI 없이 터미널에서 바로 쓸 수 있게 한 것 (actions.importTransactions와 동일한 규칙).
 *
 *   npm run import:kakao -- "<파일경로>"
 *   npm run import:kakao -- "<파일경로>" --dry     # 저장 없이 미리보기만
 *
 * 본인이체·저금통은 소비가 아니므로 자동 제외한다 (parseKakaoRows). 나머지 출금은
 * 지출, 입금은 수입으로 저장. 같은 날+금액+방향은 중복으로 건너뛴다.
 */
import { readFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import {
  parseKakaoRows,
  summarizeKakao,
  extractAccountHolder,
} from "../src/core/kakaobank-import";
import { transactionKey } from "../src/core/csv-import";

const DEMO_EMAIL = "demo@example.com"; // actions.ts와 동일 (단일 사용자 데모)

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error('사용법: npm run import:kakao -- "<파일경로>" [--dry]');
  process.exit(1);
}

const won = (n: number) => n.toLocaleString("ko-KR") + "원";

async function main(filePath: string) {
  // SheetJS ESM 빌드엔 readFile(fs)이 없어 직접 읽어 넘긴다.
  const wb = XLSX.read(readFileSync(filePath), { type: "buffer" });
  const ws = wb.Sheets[wb.SheetNames[0]!]!;
  const rows = XLSX.utils.sheet_to_json<string[]>(ws, {
    header: 1,
    defval: "",
    raw: false,
  });

  const holder = extractAccountHolder(rows);
  const drafts = parseKakaoRows(rows);
  if (drafts.length === 0) {
    console.error(
      "카카오뱅크 거래내역 형식을 찾지 못했습니다. '거래일시' 헤더가 있는 파일인지 확인하세요.",
    );
    process.exit(1);
  }

  const s = summarizeKakao(drafts);
  console.log(`계좌주: ${holder || "(미상)"}  ·  전체 ${drafts.length}건 파싱`);
  console.log(
    `포함  지출 ${won(s.expenseTotal)}(${s.includedExpenseCount}건) · 입금 ${won(
      s.incomeTotal,
    )}(${s.includedIncomeCount}건)`,
  );
  console.log(
    `제외  본인이체 ${won(
      s.excludedByReason["self-transfer"].total,
    )}(${s.excludedByReason["self-transfer"].count}건) · 저금통 ${won(
      s.excludedByReason.savings.total,
    )}(${s.excludedByReason.savings.count}건)`,
  );

  // 저장 대상: 제외 안 된 거래만 (UI 기본값과 동일)
  const included = drafts.filter((d) => !d.excluded);

  if (dryRun) {
    console.log(`\n[dry-run] 저장하지 않음. 저장 대상 ${included.length}건.`);
    return;
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.upsert({
      where: { email: DEMO_EMAIL },
      update: {},
      create: { email: DEMO_EMAIL },
    });

    const existing = await prisma.transaction.findMany({
      where: { userId: user.id },
      select: { date: true, amount: true, direction: true },
    });
    const dedupKey = (d: Date, a: number, dir: string) =>
      `${dir}|${transactionKey(d, a)}`;
    const seen = new Set(
      existing.map((t) => dedupKey(t.date, t.amount, t.direction)),
    );

    const toCreate = [];
    let skipped = 0;
    for (const d of included) {
      const key = dedupKey(d.date, d.amount, d.direction);
      if (seen.has(key)) {
        skipped++;
        continue;
      }
      seen.add(key);
      toCreate.push({
        userId: user.id,
        date: d.date,
        amount: d.amount,
        category: d.category,
        direction: d.direction,
        isFixed: false,
        memo: d.content || d.txType || null,
      });
    }

    if (toCreate.length > 0) {
      await prisma.transaction.createMany({ data: toCreate });
    }
    console.log(
      `\n저장 완료: ${toCreate.length}건 추가, ${skipped}건 중복 건너뜀.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main(file).catch((e) => {
  console.error(e);
  process.exit(1);
});
