import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router';
import { ArrowLeft, Calendar, Mail, Phone, User, Activity, Plus, Pencil, Trash2, CheckCircle } from 'lucide-react';
import {
  createEncounter,
  deleteRiskAssessment,
  deactivatePatient,
  getPatientEncounters,
  getPatientRiskAssessments,
  getPatients,
  updatePatient,
  updateRiskAssessmentReviewStatus,
} from '../api/client';
import type { Encounter, Patient, RiskAssessment } from '../api/types';

export function PatientDetails() {
  const { patientId } = useParams();
  const numericPatientId = Number(patientId);
  const navigate = useNavigate();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [encounters, setEncounters] = useState<Encounter[]>([]);
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [isEncounterOpen, setIsEncounterOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [encounterForm, setEncounterForm] = useState({
    notes: '',
    featureName: '',
    featureValue: '',
  });
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dateOfBirth: '',
    sex: '',
    email: '',
    phone: '',
    externalPatientCode: '',
  });

  useEffect(() => {
    if (!numericPatientId) {
      setPatient(null);
      setEncounters([]);
      setAssessments([]);
      return;
    }

    let isMounted = true;

    getPatients()
      .then((loadedPatients) => {
        if (!isMounted) {
          return;
        }
        const selected = loadedPatients.find(p => p.patientId === numericPatientId) ?? null;
        setPatient(selected);
        if (selected) {
          setFormData({
            firstName: selected.firstName,
            lastName: selected.lastName,
            dateOfBirth: selected.dateOfBirth,
            sex: selected.sex ?? '',
            email: selected.email,
            phone: selected.phone,
            externalPatientCode: selected.externalPatientCode,
          });
        }
      })
      .catch(() => {
        if (isMounted) {
          setPatient(null);
        }
      });

    getPatientEncounters(numericPatientId)
      .then((loadedEncounters) => {
        if (isMounted) {
          setEncounters(loadedEncounters);
        }
      })
      .catch(() => {
        if (isMounted) {
          setEncounters([]);
        }
      });

    getPatientRiskAssessments(numericPatientId)
      .then((loadedAssessments) => {
        if (isMounted) {
          setAssessments(loadedAssessments);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAssessments([]);
        }
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

  const calculateAge = (dob: string) => {
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const savePatient = async () => {
    if (!patient) {
      return;
    }
    setErrorMessage('');
    try {
      const updated = await updatePatient(patient.patientId, {
        firstName: formData.firstName,
        lastName: formData.lastName,
        dateOfBirth: formData.dateOfBirth,
        sex: formData.sex || null,
        email: formData.email,
        phone: formData.phone,
        externalPatientCode: formData.externalPatientCode,
      });
      setPatient(updated);
      setIsEditing(false);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to update patient.');
      } else {
        setErrorMessage('Failed to update patient.');
      }
    }
  };

  const removePatient = async () => {
    if (!patient) {
      return;
    }
    const confirmed = window.confirm('Remove this patient? This will hide them from the list.');
    if (!confirmed) {
      return;
    }
    setErrorMessage('');
    try {
      await deactivatePatient(patient.patientId);
      navigate('/patients');
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to remove patient.');
      } else {
        setErrorMessage('Failed to remove patient.');
      }
    }
  };

  const markReviewed = async (assessmentId: number) => {
    setErrorMessage('');
    const previous = assessments;
    setAssessments((current) =>
      current.map((assessment) =>
        assessment.assessmentId === assessmentId
          ? { ...assessment, reviewStatus: 'reviewed' }
          : assessment
      )
    );
    try {
      await updateRiskAssessmentReviewStatus(assessmentId, 'reviewed');
    } catch (error) {
      setAssessments(previous);
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to update review status.');
      } else {
        setErrorMessage('Failed to update review status.');
      }
    }
  };

  const removeAssessment = async (assessmentId: number) => {
    const confirmed = window.confirm('Remove this risk assessment? This action cannot be undone.');
    if (!confirmed) {
      return;
    }
    setErrorMessage('');
    const previous = assessments;
    setAssessments((current) => current.filter((assessment) => assessment.assessmentId !== assessmentId));
    try {
      await deleteRiskAssessment(assessmentId);
    } catch (error) {
      setAssessments(previous);
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to remove assessment.');
      } else {
        setErrorMessage('Failed to remove assessment.');
      }
    }
  };

  const handleCreateEncounter = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patient) {
      return;
    }
    setErrorMessage('');
    try {
      const featureName = encounterForm.featureName.trim();
      const featureValue = encounterForm.featureValue.trim();
      await createEncounter({
        patientId: patient.patientId,
        notes: encounterForm.notes.trim(),
        features: featureName && featureValue
          ? [{ name: featureName, value: featureValue, valueType: 'string' }]
          : [],
      });
      const refreshedEncounters = await getPatientEncounters(patient.patientId);
      setEncounters(refreshedEncounters);
      setEncounterForm({ notes: '', featureName: '', featureValue: '' });
      setIsEncounterOpen(false);
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to add encounter.');
      } else {
        setErrorMessage('Failed to add encounter.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <Link to="/patients" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to patients</span>
      </Link>

      {/* Patient Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className={`w-16 h-16 rounded-full flex items-center justify-center ${
              patient.sex === 'male' ? 'bg-blue-100' : 'bg-pink-100'
            }`}>
              <User className={`w-8 h-8 ${
                patient.sex === 'male' ? 'text-blue-600' : 'text-pink-600'
              }`} />
            </div>
            <div>
              <h1 className="mb-1">{patient.firstName} {patient.lastName}</h1>
              <p className="text-gray-600">{patient.externalPatientCode}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setIsEditing((prev) => !prev)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Pencil className="w-4 h-4" />
              <span>{isEditing ? 'Cancel Edit' : 'Edit Patient'}</span>
            </button>
            <button
              type="button"
              onClick={removePatient}
              className="flex items-center gap-2 px-4 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              <span>Remove</span>
            </button>
            <Link
              to={`/patients/${patientId}/assess`}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Activity className="w-5 h-5" />
              <span>New Risk Assessment</span>
            </Link>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        )}

        {isEditing && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">First Name</label>
              <input
                name="firstName"
                value={formData.firstName}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Last Name</label>
              <input
                name="lastName"
                value={formData.lastName}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date of Birth</label>
              <input
                name="dateOfBirth"
                type="date"
                value={formData.dateOfBirth}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Sex</label>
              <select
                name="sex"
                value={formData.sex}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              >
                <option value="">Unspecified</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Email</label>
              <input
                name="email"
                value={formData.email}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Phone</label>
              <input
                name="phone"
                value={formData.phone}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">External Patient Code</label>
              <input
                name="externalPatientCode"
                value={formData.externalPatientCode}
                onChange={handleInputChange}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div className="flex items-end">
              <button
                type="button"
                onClick={savePatient}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                <CheckCircle className="w-4 h-4" />
                <span>Save Changes</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Calendar className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-xs text-gray-600">Age</p>
              <p className="text-sm">{calculateAge(patient.dateOfBirth)} years</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <User className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-xs text-gray-600">Sex</p>
              <p className="text-sm capitalize">{patient.sex}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Mail className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-xs text-gray-600">Email</p>
              <p className="text-sm truncate">{patient.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Phone className="w-5 h-5 text-gray-600" />
            <div>
              <p className="text-xs text-gray-600">Phone</p>
              <p className="text-sm">{patient.phone}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Risk Assessments */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2>Risk Assessments</h2>
          <span className="text-sm text-gray-600">{assessments.length} assessments</span>
        </div>
        {assessments.length > 0 ? (
          <div className="space-y-3">
            {assessments.map((assessment) => (
              <div
                key={assessment.assessmentId}
                className="p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className={`px-3 py-1 rounded-full text-xs ${
                          assessment.riskLevel === 'high'
                            ? 'bg-red-100 text-red-700'
                            : assessment.riskLevel === 'medium'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {assessment.riskLevel} risk
                      </span>
                      <span className="text-sm">
                        CVD Probability: {(assessment.probabilityCvd * 100).toFixed(1)}%
                      </span>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded-full text-xs capitalize ${
                          assessment.reviewStatus === 'reviewed'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {assessment.reviewStatus}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">{assessment.modelName}</p>
                  </div>
                  <div className="text-sm text-gray-600">
                    {new Date(assessment.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="mt-3 p-3 bg-gray-50 rounded-lg">
                  <p className="text-sm">{assessment.recommendation}</p>
                </div>
                <div className="mt-3 flex items-center gap-4">
                  {assessment.reviewStatus !== 'reviewed' && (
                    <button
                      type="button"
                      onClick={() => markReviewed(assessment.assessmentId)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Mark reviewed
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAssessment(assessment.assessmentId)}
                    className="text-xs text-red-600 hover:text-red-800"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <Activity className="w-12 h-12 mx-auto mb-3 text-gray-400" />
            <p>No risk assessments yet</p>
            <Link
              to={`/patients/${patientId}/assess`}
              className="text-blue-600 hover:underline text-sm mt-2 inline-block"
            >
              Create first assessment
            </Link>
          </div>
        )}
      </div>

      {/* Encounters */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2>Encounters</h2>
          <button
            type="button"
            onClick={() => setIsEncounterOpen((current) => !current)}
            className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Encounter</span>
          </button>
        </div>
        {isEncounterOpen && (
          <form onSubmit={handleCreateEncounter} className="mb-4 p-4 border border-gray-200 rounded-lg bg-gray-50 space-y-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Encounter Notes</label>
              <textarea
                value={encounterForm.notes}
                onChange={(e) => setEncounterForm((current) => ({ ...current, notes: e.target.value }))}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                placeholder="Visit notes, observations, and summary..."
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1">Additional Feature Name (optional)</label>
                <input
                  value={encounterForm.featureName}
                  onChange={(e) => setEncounterForm((current) => ({ ...current, featureName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. pulse"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">Additional Feature Value (optional)</label>
                <input
                  value={encounterForm.featureValue}
                  onChange={(e) => setEncounterForm((current) => ({ ...current, featureValue: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="e.g. 78"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Save Encounter
              </button>
              <button
                type="button"
                onClick={() => setIsEncounterOpen(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-white transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {encounters.length > 0 ? (
          <div className="space-y-4">
            {encounters.map((encounter) => (
              <div
                key={encounter.encounterId}
                className="p-4 border border-gray-200 rounded-lg"
              >
                <div className="flex items-start justify-between mb-3">
                  <p className="text-sm">
                    {new Date(encounter.encounterDate).toLocaleString()}
                  </p>
                  <span className="text-xs text-gray-600">
                    {encounter.features.length} features
                  </span>
                </div>
                <p className="text-sm text-gray-700 mb-3">{encounter.notes}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {encounter.features.map((feature) => (
                    <div key={feature.featureId} className="p-2 bg-gray-50 rounded">
                      <p className="text-xs text-gray-600">{feature.featureCode}</p>
                      <p className="text-sm">{feature.featureValue}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>No encounters recorded</p>
          </div>
        )}
      </div>
    </div>
  );
}
