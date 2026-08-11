export const adminChartTooltipProps = {
  contentStyle: {
    backgroundColor: "var(--surface-overlay)",
    border: "1px solid var(--border-default)",
    borderRadius: "12px",
    boxShadow: "0 18px 45px rgb(0 0 0 / 0.38)",
    color: "var(--text-primary)",
    padding: "10px 12px",
  },
  labelStyle: {
    color: "var(--text-primary)",
    fontWeight: 600,
    marginBottom: "6px",
  },
  itemStyle: {
    padding: "3px 0",
    fontWeight: 500,
  },
  cursor: { fill: "color-mix(in oklab, var(--text-tertiary) 10%, transparent)" },
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

export const adminChartSeries = {
  registrations: "var(--module-clientes)",
  trials: "var(--module-comercial)",
  paid: "var(--semantic-success)",
  renewals: "var(--semantic-warning)",
  expired: "var(--semantic-danger)",
  inactive: "var(--semantic-inactive)",
} as const;
