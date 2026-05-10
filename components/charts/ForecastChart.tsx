"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export function ForecastChart({ data }: { data: { date: string; units: number }[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="#64748b" />
          <YAxis tick={{ fontSize: 11 }} stroke="#64748b" />
          <Tooltip contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0" }} />
          <Bar dataKey="units" fill="#16a34a" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
