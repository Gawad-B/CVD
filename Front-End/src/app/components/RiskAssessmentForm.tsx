import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router';
import { ArrowLeft, Activity, AlertCircle, Loader2 } from 'lucide-react';
import { getModels, getPatients, submitRiskAssessment } from '../api/client';
import type { Model, Patient } from '../api/types';

function calculateAgeFromDob(dob: string): number | null {
  if (!dob) {
    return null;
  }
  const birthDate = new Date(dob);
  if (Number.isNaN(birthDate.getTime())) {
    return null;
  }
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

const defaultFormData = {
  systolicBp: '',
  diastolicBp: '',
  totalCholesterol: '',
  hdl: '',
  bmi: '',
  smoker: 'no',
  diabetic: 'no',
  hba1cPercent: '',
  hsCrp: '',
  sodium: '',
  wbc: '',
  hemoglobin: '',
  platelets: '',
  rdw: '',
  vigorousActivityMinutes: '',
  moderateActivityMinutes: '',
  sedentaryMinutes: '',
  sleepHoursWeekday: '',
  sleepHoursWeekend: '',
  highBp: 'no',
  highChol: 'no',
  bpMed: 'no',
  cholMed: 'no',
  waistCm: '',
  race: '3',
  education: '3',
  incomeRatio: '',
  moderateActivityUnit: '1',
  sedentaryMinutesAlt: '',
  notes: '',
};

export function RiskAssessmentForm() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const numericPatientId = Number(patientId);
  const [patient, setPatient] = useState<Patient | null>(null);
  const [activeModel, setActiveModel] = useState<Model | undefined>(undefined);
  const [formData, setFormData] = useState(defaultFormData);
  const [submitError, setSubmitError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [result, setResult] = useState<{
    probability: number;
    riskLevel: 'low' | 'medium' | 'high';
    recommendation: string;
  } | null>(null);

  useEffect(() => {
    if (!numericPatientId) {
      setPatient(null);
      setActiveModel(undefined);
      return;
    }

    let isMounted = true;

    Promise.all([getPatients(), getModels()])
      .then(([loadedPatients, loadedModels]) => {
        if (!isMounted) {
          return;
        }
        setPatient(loadedPatients.find(p => p.patientId === numericPatientId) ?? null);
        setActiveModel(loadedModels.find(m => m.isActive));
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setPatient(null);
        setActiveModel(undefined);
      });

    return () => {
      isMounted = false;
    };
  }, [numericPatientId]);

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600">Patient not found</p>
        <Link to="/patients" className="text-blue-600 hover:underline mt-2 inline-block">
          Back to patients
        </Link>
      </div>
    );
  }

  const derivedAge = calculateAgeFromDob(patient.dateOfBirth);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isGenerating) {
      return;
    }
    setSubmitError('');

    if (derivedAge === null) {
      setSubmitError('Patient date of birth is missing or invalid, so age cannot be derived.');
      return;
    }

    const optionalNumber = (value: string): number | undefined => {
      if (value.trim() === '') {
        return undefined;
      }
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : undefined;
    };

    setIsGenerating(true);
    setResult(null);
    try {
      const response = await submitRiskAssessment({
        patientId: numericPatientId,
        payload: {
          systolicBp: Number(formData.systolicBp),
          diastolicBp: Number(formData.diastolicBp),
          totalCholesterol: Number(formData.totalCholesterol),
          hdl: Number(formData.hdl),
          bmi: Number(formData.bmi),
          smoker: formData.smoker as 'yes' | 'no',
          diabetic: formData.diabetic as 'yes' | 'no' | 'borderline',
          age: derivedAge,
          hba1cPercent: Number(formData.hba1cPercent),
          hsCrp: Number(formData.hsCrp),
          sodium: Number(formData.sodium),
          wbc: Number(formData.wbc),
          hemoglobin: Number(formData.hemoglobin),
          platelets: Number(formData.platelets),
          rdw: Number(formData.rdw),
          vigorousActivityMinutes: Number(formData.vigorousActivityMinutes),
          moderateActivityMinutes: Number(formData.moderateActivityMinutes),
          sedentaryMinutes: Number(formData.sedentaryMinutes),
          sleepHoursWeekday: Number(formData.sleepHoursWeekday),
          sleepHoursWeekend: Number(formData.sleepHoursWeekend),
          highBp: formData.highBp as 'yes' | 'no',
          highChol: formData.highChol as 'yes' | 'no',
          bpMed: formData.bpMed as 'yes' | 'no',
          cholMed: formData.cholMed as 'yes' | 'no',
          waistCm: optionalNumber(formData.waistCm),
          race: optionalNumber(formData.race),
          education: optionalNumber(formData.education),
          incomeRatio: optionalNumber(formData.incomeRatio),
          moderateActivityUnit: optionalNumber(formData.moderateActivityUnit),
          sedentaryMinutesAlt: optionalNumber(formData.sedentaryMinutesAlt),
          notes: formData.notes,
        },
      });
      setResult({
        probability: response.probability,
        riskLevel: response.riskLevel,
        recommendation: response.recommendation,
      });
    } catch (error: unknown) {
      setResult(null);
      if (error instanceof Error) {
        setSubmitError(error.message || 'Failed to create risk assessment.');
      } else {
        setSubmitError('Failed to create risk assessment.');
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <Link to={`/patients/${patientId}`} className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to patient</span>
      </Link>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-start gap-3 mb-6">
          <Activity className="w-6 h-6 text-blue-600" />
          <div>
            <h1 className="mb-1">New Risk Assessment</h1>
            <p className="text-gray-600">{patient.firstName} {patient.lastName} • {patient.externalPatientCode}</p>
            {activeModel && (
              <p className="text-sm text-gray-500 mt-1">Using: {activeModel.modelName}</p>
            )}
          </div>
        </div>

        {submitError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {submitError}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6" aria-busy={isGenerating}>
          <div className="border border-gray-200 rounded-lg p-4">
            <h3 className="text-sm text-gray-700 mb-3">Mandatory Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2">Age (derived from date of birth)</label>
                <input
                  type="number"
                  value={derivedAge ?? ''}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg bg-gray-100"
                  readOnly
                />
              </div>

              <div>
                <label className="block text-sm mb-2">Systolic BP <span className="text-red-500">*</span></label>
                <input type="number" name="systolicBp" value={formData.systolicBp} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Diastolic BP <span className="text-red-500">*</span></label>
                <input type="number" name="diastolicBp" value={formData.diastolicBp} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Total Cholesterol <span className="text-red-500">*</span></label>
                <input type="number" name="totalCholesterol" value={formData.totalCholesterol} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">HDL Cholesterol <span className="text-red-500">*</span></label>
                <input type="number" name="hdl" value={formData.hdl} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">BMI <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="bmi" value={formData.bmi} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Smoker <span className="text-red-500">*</span></label>
                <select name="smoker" value={formData.smoker} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Diabetic <span className="text-red-500">*</span></label>
                <select name="diabetic" value={formData.diabetic} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                  <option value="borderline">Borderline</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">HbA1c (%) <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="hba1cPercent" value={formData.hba1cPercent} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">hs-CRP <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="hsCrp" value={formData.hsCrp} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Sodium <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="sodium" value={formData.sodium} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">WBC <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="wbc" value={formData.wbc} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Hemoglobin <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="hemoglobin" value={formData.hemoglobin} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Platelets <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="platelets" value={formData.platelets} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">RDW <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="rdw" value={formData.rdw} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Vigorous Activity Minutes <span className="text-red-500">*</span></label>
                <input type="number" name="vigorousActivityMinutes" value={formData.vigorousActivityMinutes} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Moderate Activity Minutes <span className="text-red-500">*</span></label>
                <input type="number" name="moderateActivityMinutes" value={formData.moderateActivityMinutes} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Sedentary Minutes <span className="text-red-500">*</span></label>
                <input type="number" name="sedentaryMinutes" value={formData.sedentaryMinutes} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Sleep (Weekday Hours) <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="sleepHoursWeekday" value={formData.sleepHoursWeekday} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">Sleep (Weekend Hours) <span className="text-red-500">*</span></label>
                <input type="number" step="0.1" name="sleepHoursWeekend" value={formData.sleepHoursWeekend} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required />
              </div>

              <div>
                <label className="block text-sm mb-2">History of High BP <span className="text-red-500">*</span></label>
                <select name="highBp" value={formData.highBp} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">History of High Cholesterol <span className="text-red-500">*</span></label>
                <select name="highChol" value={formData.highChol} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">BP Medication <span className="text-red-500">*</span></label>
                <select name="bpMed" value={formData.bpMed} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>

              <div>
                <label className="block text-sm mb-2">Cholesterol Medication <span className="text-red-500">*</span></label>
                <select name="cholMed" value={formData.cholMed} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" required>
                  <option value="no">No</option>
                  <option value="yes">Yes</option>
                </select>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-200 pt-6">
            <h3 className="text-sm text-gray-700 mb-3">Additional Features</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm mb-2">Waist (cm)</label>
                <input type="number" name="waistCm" value={formData.waistCm} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm mb-2">Race Code (RIDRETH3)</label>
                <input type="number" name="race" value={formData.race} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm mb-2">Education Code (DMDEDUC2)</label>
                <input type="number" name="education" value={formData.education} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm mb-2">Income Ratio (INDFMPIR)</label>
                <input type="number" step="0.1" name="incomeRatio" value={formData.incomeRatio} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm mb-2">Moderate Activity Unit (PAD790U)</label>
                <input type="number" name="moderateActivityUnit" value={formData.moderateActivityUnit} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
              <div>
                <label className="block text-sm mb-2">Sedentary Minutes Alt (PAD680)</label>
                <input type="number" name="sedentaryMinutesAlt" value={formData.sedentaryMinutesAlt} onChange={handleChange} className="w-full px-4 py-3 border border-gray-300 rounded-lg" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-2">Clinical Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg resize-none"
              placeholder="Additional observations or notes..."
            />
          </div>

          <button
            type="submit"
            disabled={isGenerating}
            className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isGenerating && <Loader2 className="w-5 h-5 animate-spin" />}
            {isGenerating ? 'Generating Assessment...' : 'Calculate Risk Assessment'}
          </button>
          {isGenerating && (
            <p className="text-sm text-gray-600 text-center">Running the model and preparing your result...</p>
          )}
        </form>
      </div>

      {result && (
        <div className={`rounded-xl border-2 p-6 ${
          result.riskLevel === 'high'
            ? 'bg-red-50 border-red-200'
            : result.riskLevel === 'medium'
            ? 'bg-yellow-50 border-yellow-200'
            : 'bg-green-50 border-green-200'
        }`}>
          <div className="flex items-start gap-3 mb-4">
            <AlertCircle className={`w-6 h-6 ${
              result.riskLevel === 'high'
                ? 'text-red-600'
                : result.riskLevel === 'medium'
                ? 'text-yellow-600'
                : 'text-green-600'
            }`} />
            <div>
              <h2 className="mb-1">Risk Assessment Result</h2>
              <p className="text-sm text-gray-600">Model: {activeModel?.modelName}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">CVD Probability</p>
              <p className="text-3xl">{(result.probability * 100).toFixed(1)}%</p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <p className="text-sm text-gray-600 mb-1">Risk Level</p>
              <span className={`inline-block px-4 py-2 rounded-full text-lg capitalize ${
                result.riskLevel === 'high'
                  ? 'bg-red-100 text-red-700'
                  : result.riskLevel === 'medium'
                  ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-green-100 text-green-700'
              }`}>
                {result.riskLevel}
              </span>
            </div>
          </div>

          <div className="bg-white rounded-lg p-4">
            <p className="text-sm text-gray-600 mb-2">Recommendation</p>
            <p className="text-sm">{result.recommendation}</p>
          </div>

          <div className="flex gap-3 mt-6">
            <button
              onClick={() => navigate(`/patients/${patientId}`)}
              className="flex-1 py-3 bg-white border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Save & Return to Patient
            </button>
            <button
              onClick={() => {
                setResult(null);
                setSubmitError('');
                setFormData(defaultFormData);
              }}
              className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              New Assessment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
