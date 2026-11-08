<script setup lang="ts">
import { intlLocale } from "../i18n";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { Chart as VueChart } from "vue-chartjs";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  BarController,
  LineController,
  DoughnutController,
  type ChartData,
  type ChartOptions,
} from "chart.js";
import { currency } from "./store";
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
  BarController,
  LineController,
  DoughnutController,
);
type Kind = "bar" | "line" | "doughnut";
const props = withDefaults(
  defineProps<{
    type: Kind;
    data: ChartData;
    label: string;
    stacked?: boolean;
    horizontal?: boolean;
    legend?: boolean;
  }>(),
  { legend: true },
);
const emit = defineEmits<{ select: [index: number, dataset: number] }>();
const palette = ref({ ink: "#697a85", grid: "#e8edef", teal: "#286c68" });
let observer: MutationObserver | undefined;
function theme() {
  const style = getComputedStyle(document.documentElement);
  palette.value = {
    ink: style.getPropertyValue("--muted").trim(),
    grid: style.getPropertyValue("--line").trim(),
    teal: style.getPropertyValue("--teal").trim(),
  };
}
onMounted(() => {
  theme();
  observer = new MutationObserver(theme);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
});
onBeforeUnmount(() => observer?.disconnect());
const chartData = computed<ChartData>(() => ({
  ...props.data,
  datasets: props.data.datasets.map((dataset) => ({
    ...dataset,
    ...(typeof dataset.backgroundColor === "string"
      ? {
          backgroundColor: dataset.backgroundColor.replace(
            "#286c68",
            palette.value.teal,
          ),
        }
      : {}),
    ...(typeof dataset.borderColor === "string"
      ? {
          borderColor: dataset.borderColor.replace(
            "#286c68",
            palette.value.teal,
          ),
        }
      : {}),
  })),
}));
const options = computed<ChartOptions>(() => ({
  locale: intlLocale(),
  responsive: true,
  maintainAspectRatio: false,
  animation: matchMedia("(prefers-reduced-motion: reduce)").matches
    ? false
    : { duration: 250 },
  indexAxis: props.horizontal ? "y" : "x",
  interaction: { mode: "nearest", intersect: true },
  plugins: {
    legend: {
      display: props.legend !== false && props.type !== "doughnut",
      position: "bottom",
      labels: {
        color: palette.value.ink,
        usePointStyle: true,
        pointStyle: "circle",
        boxWidth: 6,
        boxHeight: 6,
        padding: 18,
        font: {
          family: "-apple-system, BlinkMacSystemFont, sans-serif",
          size: 11,
        },
      },
    },
    tooltip: {
      padding: 12,
      cornerRadius: 10,
      displayColors: true,
      callbacks: {
        label: (context) =>
          `${context.dataset.label ? `${context.dataset.label}: ` : ""}${currency(context.raw)}`,
      },
    },
  },
  ...(props.type === "doughnut"
    ? { cutout: "72%", borderWidth: 3 }
    : {
        scales: {
          x: {
            stacked: props.stacked,
            grid: { display: props.horizontal, color: palette.value.grid },
            border: { display: false },
            ticks: {
              color: palette.value.ink,
              maxRotation: 0,
              maxTicksLimit: props.horizontal ? 5 : 8,
              font: { size: 10 },
              ...(props.horizontal
                ? {
                    callback: (value) =>
                      new Intl.NumberFormat(intlLocale(), {
                        notation: "compact",
                      }).format(Number(value)),
                  }
                : {}),
            },
          },
          y: {
            stacked: props.stacked,
            beginAtZero: true,
            grid: { display: !props.horizontal, color: palette.value.grid },
            border: { display: false },
            ticks: {
              color: palette.value.ink,
              maxTicksLimit: 5,
              font: { size: 10 },
              ...(!props.horizontal
                ? {
                    callback: (value) =>
                      new Intl.NumberFormat(intlLocale(), {
                        notation: "compact",
                      }).format(Number(value)),
                  }
                : {}),
            },
          },
        },
      }),
  onClick: (_event, elements) => {
    if (elements[0])
      emit("select", elements[0].index, elements[0].datasetIndex);
  },
  onHover: (_event, elements, chart) => {
    chart.canvas.style.cursor = elements.length ? "pointer" : "default";
  },
}));
</script>

<template>
  <div class="finance-chart">
    <VueChart
      :type="type"
      :data="chartData"
      :options="options"
      role="img"
      :aria-label="label"
    />
  </div>
</template>
