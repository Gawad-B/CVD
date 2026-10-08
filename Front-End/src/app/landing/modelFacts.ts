/**
 * Model numbers shown on the landing page. Source of truth: Back-End/model/metrics_ml.json
 * (auc 0.8636 -> 0.864, sensitivity 0.8421 -> 84%, specificity 0.7331 -> 73%,
 * balanced_accuracy 0.7876 -> 79%, n_train + n_test = 5,330) and Back-End/ml/nhanes.py
 * (34 raw inputs). Update here when the model is retrained.
 */
export const MODEL_FACTS = {
  version: "CVD NHANES Logistic v4.0.0",
  rocAuc: "0.864",
  sensitivity: "84%",
  specificity: "73%",
  balancedAccuracy: "79%",
  patients: "5,330",
  inputs: "34",
  inputsWord: "thirty-four",
} as const;
