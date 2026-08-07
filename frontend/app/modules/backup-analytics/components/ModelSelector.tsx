"use client";

interface ModelInfo {
  name: string;
  description: string;
  min_data_points: number;
  speed: string;
  accuracy: string;
}

interface ModelSelectorProps {
  selected_model: string;
  onModelChange: (model: string) => void;
  available_models?: ModelInfo[];
}

const default_models: ModelInfo[] = [
  { name: "auto", description: "Auto-select best model", min_data_points: 10, speed: "varies", accuracy: "best" },
  { name: "linear", description: "Linear regression (fast)", min_data_points: 10, speed: "fast", accuracy: "moderate" },
  { name: "polynomial", description: "Polynomial regression", min_data_points: 10, speed: "fast", accuracy: "good" },
  { name: "exponential_smoothing", description: "Holt-Winters smoothing", min_data_points: 14, speed: "moderate", accuracy: "good" },
  { name: "prophet", description: "Facebook Prophet", min_data_points: 30, speed: "slow", accuracy: "excellent" },
  { name: "sarimax", description: "Seasonal ARIMA", min_data_points: 30, speed: "slow", accuracy: "excellent" },
];

export function ModelSelector({ selected_model, onModelChange, available_models }: ModelSelectorProps) {
  const models = available_models || default_models;

  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium">Prediction Model</label>
      <select
        value={selected_model}
        onChange={(e) => onModelChange(e.target.value)}
        className="w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
      >
        {models.map((model) => (
          <option key={model.name} value={model.name}>
            {model.name} - {model.description}
          </option>
        ))}
      </select>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {models.find((m) => m.name === selected_model)?.description}
      </div>
    </div>
  );
}
