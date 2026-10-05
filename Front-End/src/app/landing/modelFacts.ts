/**
 * Model numbers shown on the landing page. Source of truth: Back-End/model/metrics_ml.json
 * (accuracy 0.8358 -> 83.6%, auc 0.8857 -> 0.886, recall 0.8806 -> 88%, precision 0.8082 -> 81%)
 * and Back-End/model/feature_schema.json (31 raw inputs). Update here when the model is retrained.
 */
export const MODEL_FACTS = {
  version: "CVD Stacked Ensemble v3.0.0",
  accuracy: "83.6%",
  rocAuc: "0.886",
  recall: "88%",
  precision: "81%",
  inputs: "31",
  inputsWord: "thirty-one",
} as const;
