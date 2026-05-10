"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function RevenueChart({ data }: { data: { date: string; revenue: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#16a34a" stopOpacity={0.5} />
              <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748b" />
          <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }}
            formatter={(v: number) => [`৳${v.toLocaleString()}`, "Revenue"]}
          />
          <Area type="monotone" dataKey="revenue" stroke="#16a34a" fill="url(#rev)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
