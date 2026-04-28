import { useEffect, useState } from 'react';
import { Brain, CheckCircle, Circle, TrendingUp } from 'lucide-react';
import { getModels } from '../api/client';
import type { Model } from '../api/types';

export function ModelRegistry() {
  const [models, setModels] = useState<Model[]>([]);
  const [selectedModel, setSelectedModel] = useState<Model | null>(null);

  useEffect(() => {
    let isMounted = true;

    getModels()
      .then((loadedModels) => {
        if (!isMounted) {
          return;
        }
        setModels(loadedModels);
        setSelectedModel(loadedModels[0] ?? null);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setModels([]);
        setSelectedModel(null);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!selectedModel) {
    return (
      <div className="space-y-6">
        <div>
          <h1>Model Registry</h1>
          <p className="text-gray-600 mt-1">Machine learning models for cardiovascular risk prediction</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-600">
          No model data available yet.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1>Model Registry</h1>
        <p className="text-gray-600 mt-1">Machine learning models for cardiovascular risk prediction</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Models List */}
        <div className="lg:col-span-1 space-y-3">
          {models.map((model) => (
            <button
              key={model.modelId}
              onClick={() => setSelectedModel(model)}
              className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                selectedModel.modelId === model.modelId
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Brain className={`w-5 h-5 ${
                    selectedModel.modelId === model.modelId ? 'text-blue-600' : 'text-gray-600'
                  }`} />
                  {model.isActive ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-gray-400" />
                  )}
                </div>
                {model.isActive && (
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm mb-1">{model.modelName}</p>
              <p className="text-xs text-gray-600">v{model.modelVersion}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-xs text-gray-600">AUC:</span>
                <span className="text-xs">{(model.auc * 100).toFixed(1)}%</span>
              </div>
            </button>
          ))}
        </div>

        {/* Model Details */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <h2>{selectedModel.modelName}</h2>
                {selectedModel.isActive && (
                  <span className="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-gray-600">Version {selectedModel.modelVersion}</p>
            </div>
            {!selectedModel.isActive && (
              <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                Activate Model
              </button>
            )}
          </div>

          {/* Model Info */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">Algorithm</p>
              <p className="text-sm">{selectedModel.algorithm}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">Use Case</p>
              <p className="text-sm capitalize">{selectedModel.useCase.replace(/_/g, ' ')}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">Trained</p>
              <p className="text-sm">{new Date(selectedModel.trainedAt).toLocaleDateString()}</p>
            </div>
            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-600 mb-1">Status</p>
              <p className="text-sm">{selectedModel.isActive ? 'Active' : 'Inactive'}</p>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="mb-6">
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg">Performance Metrics</h3>
            </div>
            
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">AUC (Area Under Curve)</span>
                  <span className="text-sm">{(selectedModel.auc * 100).toFixed(2)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-blue-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${selectedModel.auc * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Accuracy</span>
                  <span className="text-sm">{(selectedModel.accuracy * 100).toFixed(2)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-green-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${selectedModel.accuracy * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Precision</span>
                  <span className="text-sm">{(selectedModel.precision * 100).toFixed(2)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-purple-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${selectedModel.precision * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Recall</span>
                  <span className="text-sm">{(selectedModel.recall * 100).toFixed(2)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-orange-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${selectedModel.recall * 100}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">F1 Score</span>
                  <span className="text-sm">{(selectedModel.f1Score * 100).toFixed(2)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3">
                  <div
                    className="bg-pink-600 h-3 rounded-full transition-all duration-500"
                    style={{ width: `${selectedModel.f1Score * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Comparison Table */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs text-gray-600 uppercase">Metric</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-600 uppercase">Value</th>
                  <th className="px-4 py-2 text-right text-xs text-gray-600 uppercase">Industry Avg</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-2">AUC</td>
                  <td className="px-4 py-2 text-right">{(selectedModel.auc * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-gray-600">-</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Accuracy</td>
                  <td className="px-4 py-2 text-right">{(selectedModel.accuracy * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-gray-600">-</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Precision</td>
                  <td className="px-4 py-2 text-right">{(selectedModel.precision * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-gray-600">-</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">Recall</td>
                  <td className="px-4 py-2 text-right">{(selectedModel.recall * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-gray-600">-</td>
                </tr>
                <tr>
                  <td className="px-4 py-2">F1 Score</td>
                  <td className="px-4 py-2 text-right">{(selectedModel.f1Score * 100).toFixed(2)}%</td>
                  <td className="px-4 py-2 text-right text-gray-600">-</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
