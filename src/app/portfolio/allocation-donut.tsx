"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

/** 도넛 차트. 색을 직접 받아 유형별/종목별 어느 쪽이든 그린다. 가운데는 비워 둔다. */
export function AllocationDonut({ data }: { data: DonutDatum[] }) {
  return (
    <div className="h-40 w-40 shrink-0">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius="62%"
            outerRadius="100%"
            paddingAngle={2}
            stroke="none"
            startAngle={90}
            endAngle={-270}
            isAnimationActive={false}
          >
            {data.map((d, i) => (
              <Cell key={i} fill={d.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
