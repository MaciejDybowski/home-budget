<script setup lang="ts">
import { tr } from "../i18n";
import { computed } from "vue";
import ChoiceSelect from "./ChoiceSelect.vue";
import { state } from "./store";

const props = withDefaults(
  defineProps<{
    merchantId?: string | null;
    name?: string | null;
    label?: string;
    id?: string;
    disabled?: boolean;
    required?: boolean;
  }>(),
  {},
);
const emit = defineEmits<{
  select: [merchant: { id: string | null; name: string }];
}>();
const normalized = (name: string) =>
  name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("pl");
const merchants = computed(() => state.value?.merchants || []);
const selected = computed(
  () =>
    merchants.value.find((m) => m.id === props.merchantId) ||
    merchants.value.find(
      (m) => normalized(m.name) === normalized(props.name || ""),
    ),
);
const current = computed(
  () => selected.value?.id || (props.name ? "__current__" : ""),
);
const options = computed(() => [
  ...(!props.required
    ? [{ value: "", label: tr("Bez przypisanego sklepu") }]
    : []),
  ...(!selected.value && props.name
    ? [{ value: "__current__", label: props.name }]
    : []),
  ...merchants.value.map((merchant) => ({
    value: merchant.id,
    label: merchant.name,
  })),
]);
function choose(value: string | null | undefined) {
  if (value === "__current__") return;
  const merchant = merchants.value.find((m) => m.id === value);
  emit("select", { id: merchant?.id || null, name: merchant?.name || "" });
}
</script>

<template>
  <ChoiceSelect
    :id="id"
    :model-value="current"
    :options="options"
    :label="label || tr('Sklep')"
    :disabled="disabled"
    :required="required"
    creatable
    :placeholder="tr('Wybierz lub dodaj sklep')"
    @change="choose"
    @create="(name) => emit('select', { id: null, name })"
  />
</template>
