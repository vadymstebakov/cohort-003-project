import type { CSSProperties } from "react";
import {
  Tooltip,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import type { ComponentProps } from "react";

// ─── Tooltip ───

const tooltipContentStyle: CSSProperties = {
  backgroundColor: "var(--popover)",
  borderColor: "var(--border)",
  color: "var(--popover-foreground)",
  borderRadius: "var(--radius)",
  fontSize: 12,
};

type TooltipProps = ComponentProps<typeof Tooltip>;

export function ChartTooltip(props: TooltipProps) {
  return <Tooltip contentStyle={tooltipContentStyle} {...props} />;
}

// ─── CartesianGrid ───

type GridProps = ComponentProps<typeof CartesianGrid>;

export function ChartGrid(props: GridProps) {
  return (
    <CartesianGrid strokeDasharray="3 3" className="stroke-border" {...props} />
  );
}

// ─── XAxis ───

type XAxisProps = ComponentProps<typeof XAxis>;

export function ChartXAxis(props: XAxisProps) {
  return (
    <XAxis
      tick={{ fontSize: 12 }}
      className="fill-muted-foreground"
      {...props}
    />
  );
}

// ─── YAxis ───

type YAxisProps = ComponentProps<typeof YAxis>;

export function ChartYAxis(props: YAxisProps) {
  return (
    <YAxis
      tick={{ fontSize: 12 }}
      className="fill-muted-foreground"
      {...props}
    />
  );
}

// ─── ResponsiveContainer ───

export const ChartContainer = ResponsiveContainer;
