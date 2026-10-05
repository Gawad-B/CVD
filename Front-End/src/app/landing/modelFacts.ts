/**
 * Model numbers shown on the landing page. Source of truth: Back-End/model/metrics_ml.json
 * (auc 0.8975 -> 0.898, recall 0.8955 -> 90%, precision 0.7595 -> 76%) and
 * Back-End/model/feature_schema.json (31 raw inputs). Update here when the model is retrained.
 */
export const MODEL_FACTS = {
  version: "CVD Stacked Pipeline v2.0.0",
  rocAuc: "0.898",
  recall: "90%",
  precision: "76%",
  inputs: "31",
  inputsWord: "thirty-one",
} as const;
