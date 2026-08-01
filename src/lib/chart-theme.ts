export const adminChartTooltipProps = {
  contentStyle: {
    backgroundColor: "hsl(var(--popover))",
    border: "1px solid hsl(var(--border))",
    borderRadius: "12px",
    boxShadow: "0 18px 45px rgb(0 0 0 / 0.38)",
    color: "hsl(var(--popover-foreground))",
    padding: "10px 12px",
  },
  labelStyle: {
    color: "hsl(var(--popover-foreground))",
    fontWeight: 600,
    marginBottom: "6px",
  },
  itemStyle: {
    padding: "3px 0",
    fontWeight: 500,
  },
  cursor: { fill: "hsl(var(--muted) / 0.16)" },
};

export const adminChartLegendProps = {
  iconType: "circle" as const,
  iconSize: 8,
  wrapperStyle: {
    color: "hsl(var(--muted-foreground))",
    fontSize: "12px",
    paddingTop: "12px",
  },
};
