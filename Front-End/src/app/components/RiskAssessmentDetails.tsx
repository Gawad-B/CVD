import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { deleteRiskAssessment, getRiskAssessmentById, updateRiskAssessmentReviewStatus } from '../api/client';
import type { RiskAssessment } from '../api/types';

export function RiskAssessmentDetails() {
  const { assessmentId } = useParams();
  const navigate = useNavigate();
  const numericAssessmentId = Number(assessmentId);
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!numericAssessmentId) {
      setAssessment(null);
      return;
    }
    let isMounted = true;
    getRiskAssessmentById(numericAssessmentId)
      .then((loadedAssessment) => {
        if (isMounted) {
          setAssessment(loadedAssessment);
        }
      })
      .catch(() => {
        if (isMounted) {
          setAssessment(null);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [numericAssessmentId]);

  const markReviewed = async () => {
    if (!assessment || assessment.reviewStatus === 'reviewed') {
      return;
    }
    setErrorMessage('');
    const previous = assessment;
    setAssessment({ ...assessment, reviewStatus: 'reviewed' });
    try {
      await updateRiskAssessmentReviewStatus(assessment.assessmentId, 'reviewed');
    } catch (error) {
      setAssessment(previous);
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to update review status.');
      } else {
        setErrorMessage('Failed to update review status.');
      }
    }
  };

  const removeAssessment = async () => {
    if (!assessment) {
      return;
    }
    const confirmed = window.confirm('Remove this risk assessment? This action cannot be undone.');
    if (!confirmed) {
      return;
    }

    setErrorMessage('');
    try {
      await deleteRiskAssessment(assessment.assessmentId);
      navigate('/assessments');
    } catch (error) {
      if (error instanceof Error) {
        setErrorMessage(error.message || 'Failed to remove assessment.');
      } else {
        setErrorMessage('Failed to remove assessment.');
      }
    }
  };

  if (!assessment) {
    return (
      <div className="space-y-4">
        <Link to="/assessments" className="text-blue-600 hover:underline">
          Back to assessments
        </Link>
        <p className="text-gray-600">Risk assessment not found.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/assessments" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to assessments</span>
      </Link>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1>Assessment #{assessment.assessmentId}</h1>
            <p className="text-sm text-gray-600 mt-1">
              Created {new Date(assessment.createdAt).toLocaleString()}
            </p>
          </div>
          <button
            type="button"
            onClick={removeAssessment}
            className="flex items-center gap-2 px-3 py-2 border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
            <span>Remove</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Patient</p>
            <Link to={`/patients/${assessment.patientId}`} className="text-blue-600 hover:underline">
              {assessment.patientName} (ID: {assessment.patientId})
            </Link>
          </div>
          <div>
            <p className="text-xs text-gray-500">Model</p>
            <p>{assessment.modelName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Risk level</p>
            <p className="capitalize">{assessment.riskLevel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Probability</p>
            <p>{(assessment.probabilityCvd * 100).toFixed(2)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Review status</p>
            <p className="capitalize">{assessment.reviewStatus}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Assessment status</p>
            <p className="capitalize">{assessment.assessmentStatus}</p>
          </div>
        </div>

        <div>
          <p className="text-xs text-gray-500 mb-1">Recommendation</p>
          <p className="text-sm">{assessment.recommendation || 'No recommendation provided.'}</p>
        </div>

        {assessment.reviewStatus !== 'reviewed' && (
          <button
            type="button"
            onClick={() => {
              void markReviewed();
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Mark reviewed
          </button>
        )}
      </div>
    </div>
  );
}
