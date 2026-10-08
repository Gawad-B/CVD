/**
 * Model numbers shown on the landing page. Source of truth: Back-End/model/metrics_ml.json
 * (auc 0.8606 -> 0.861, sensitivity 0.9023 -> 90%, specificity 0.6334 -> 63%, ppv 0.2603 -> 26%,
 * npv 0.9776 -> 98%, n_train + n_test = 5,330, n_test = 1,066) and Back-End/ml/nhanes.py
 * (34 raw inputs). Update here when the model is retrained.
 */
export const MODEL_FACTS = {
  version: "CVD NHANES Logistic v4.1.0",
  rocAuc: "0.861",
  sensitivity: "90%",
  specificity: "63%",
  ppv: "26%",
  npv: "98%",
  patients: "5,330",
  testPatients: "1,066",
  inputs: "34",
  inputsWord: "thirty-four",
} as const;
