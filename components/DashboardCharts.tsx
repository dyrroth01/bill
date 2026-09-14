"use client";

import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from "recharts";

export default function DashboardCharts({
  trend,
  donut,
  donutOnly,
}: {
  trend: { month: string; Billed: number; Received: number }[];
  donut: { name: string; value: number; color: string }[];
  donutOnly?: boolean;
}) {
  if (donutOnly) {
    return (
      <div className="relative h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={donut} dataKey="value" nameKey="name" innerRadius={55} outerRadius={85} paddingAngle={3}>
              {donut.map((d) => (
                <Cell key={d.name} fill={d.color} />
              ))}
            </Pie>
            <Tooltip />
            <Legend verticalAlign="bottom" iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="mb-8 text-center">
            <div className="text-xl font-extrabold text-slate-900">{donut.reduce((s, d) => s + d.value, 0)}</div>
            <div className="text-[10px] uppercase tracking-wide text-slate-400">bills</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={trend} barGap={4}>
          <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} width={44} />
          <Tooltip formatter={(v: number) => `₹${Number(v).toLocaleString("en-IN")}`} cursor={{ fill: "#f1f5f9" }} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="Billed" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={28} />
          <Bar dataKey="Received" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
