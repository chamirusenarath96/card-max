"use client";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from "recharts";

export interface DailyPoint {
  date: string; // "Jun 07"
  [bank: string]: number | string;
}

interface Props {
  data: DailyPoint[];
  banks: string[];
}

const BANK_COLORS: Record<string, string> = {
  commercial_bank:    "#3b82f6",
  sampath_bank:       "#10b981",
  hnb:                "#f59e0b",
  nations_trust_bank: "#8b5cf6",
  amex_ntb:           "#ef4444",
  peoples_bank:       "#ec4899",
  bank_of_ceylon:     "#14b8a6",
};

const BANK_SHORT: Record<string, string> = {
  commercial_bank:    "ComBank",
  sampath_bank:       "Sampath",
  hnb:                "HNB",
  nations_trust_bank: "NTB",
  amex_ntb:           "Amex",
  peoples_bank:       "People's",
  bank_of_ceylon:     "BOC",
};

export function OffersTrendChart({ data, banks }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No scrape data found for the last 30 days.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: 12,
          }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          itemStyle={{ color: "hsl(var(--muted-foreground))" }}
        />
        <Legend
          formatter={(value: string) => (
            <span style={{ fontSize: 11, color: "hsl(var(--muted-foreground))" }}>
              {BANK_SHORT[value] ?? value}
            </span>
          )}
        />
        {banks.map((bank) => (
          <Bar
            key={bank}
            dataKey={bank}
            stackId="a"
            fill={BANK_COLORS[bank] ?? "#94a3b8"}
            name={bank}
            radius={banks.indexOf(bank) === banks.length - 1 ? [3, 3, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
