import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, Download } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { deleteRiskAssessment, getRiskAssessments, updateRiskAssessmentReviewStatus } from '../api/client';
import type { RiskAssessment } from '../api/types';

export function RiskAssessmentsList() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRisk, setFilterRisk] = useState<'all' | 'low' | 'medium' | 'high'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'reviewed'>('all');
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    getRiskAssessments()
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
  }, []);

  const filteredAssessments = assessments.filter(assessment => {
    const matchesSearch = 
      assessment.patientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      assessment.modelName.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesRisk = filterRisk === 'all' || assessment.riskLevel === filterRisk;
    const matchesStatus = filterStatus === 'all' || assessment.reviewStatus === filterStatus;

    return matchesSearch && matchesRisk && matchesStatus;
  });

  const highRiskCount = useMemo(() => assessments.filter(a => a.riskLevel === 'high').length, [assessments]);
  const mediumRiskCount = useMemo(() => assessments.filter(a => a.riskLevel === 'medium').length, [assessments]);
  const lowRiskCount = useMemo(() => assessments.filter(a => a.riskLevel === 'low').length, [assessments]);

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

  const exportAssessments = () => {
    const headers = [
      'assessment_id',
      'patient_id',
      'patient_name',
      'model_name',
      'probability_cvd',
      'risk_level',
      'review_status',
      'assessment_status',
      'recommendation',
      'created_at',
    ];
    const rows = filteredAssessments.map((assessment) => [
      assessment.assessmentId,
      assessment.patientId,
      assessment.patientName,
      assessment.modelName,
      assessment.probabilityCvd,
      assessment.riskLevel,
      assessment.reviewStatus,
      assessment.assessmentStatus,
      assessment.recommendation.replace(/\n/g, ' '),
      assessment.createdAt,
    ]);

    const toCsvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(toCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `risk-assessments-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1>Risk Assessments</h1>
          <p className="text-gray-600 mt-1">{filteredAssessments.length} assessments</p>
        </div>
        <button
          type="button"
          onClick={exportAssessments}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5" />
          <span>Export Report</span>
        </button>
      </div>

      {errorMessage && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by patient or model..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value as any)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">All Risk Levels</option>
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
            </select>
          </div>

          <div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as any)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              <option value="all">All Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="reviewed">Reviewed</option>
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700 mb-1">High Risk</p>
          <p className="text-2xl text-red-700">{highRiskCount}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-700 mb-1">Medium Risk</p>
          <p className="text-2xl text-yellow-700">{mediumRiskCount}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-700 mb-1">Low Risk</p>
          <p className="text-2xl text-green-700">{lowRiskCount}</p>
        </div>
      </div>

      {/* Assessments Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Patient
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Probability
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Risk Level
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Model
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-6 py-3 text-right text-xs text-gray-600 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredAssessments.map((assessment) => (
                <tr
                  key={assessment.assessmentId}
                  className="hover:bg-gray-50 cursor-pointer"
                  onClick={() => navigate(`/assessments/${assessment.assessmentId}`)}
                >
                  <td className="px-6 py-4">
                    <p className="text-sm">{assessment.patientName}</p>
                    <p className="text-xs text-gray-500">ID: {assessment.patientId}</p>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div
                          className={`h-2 rounded-full ${
                            assessment.riskLevel === 'high'
                              ? 'bg-red-500'
                              : assessment.riskLevel === 'medium'
                              ? 'bg-yellow-500'
                              : 'bg-green-500'
                          }`}
                          style={{ width: `${assessment.probabilityCvd * 100}%` }}
                        />
                      </div>
                      <span className="text-sm">{(assessment.probabilityCvd * 100).toFixed(1)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs capitalize ${
                        assessment.riskLevel === 'high'
                          ? 'bg-red-100 text-red-700'
                          : assessment.riskLevel === 'medium'
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                      }`}
                    >
                      {assessment.riskLevel}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-700">{assessment.modelName}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs capitalize ${
                        assessment.reviewStatus === 'reviewed'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-gray-100 text-gray-700'
                      }`}
                    >
                      {assessment.reviewStatus}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(assessment.createdAt).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <Link
                        to={`/patients/${assessment.patientId}`}
                        onClick={(event) => event.stopPropagation()}
                        className="text-xs text-gray-600 hover:text-gray-800"
                      >
                        View patient
                      </Link>
                      {assessment.reviewStatus === 'reviewed' ? (
                        <span className="text-xs text-gray-500">Reviewed</span>
                      ) : (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void markReviewed(assessment.assessmentId);
                          }}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          Mark reviewed
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          void removeAssessment(assessment.assessmentId);
                        }}
                        className="text-xs text-red-600 hover:text-red-800"
                      >
                        Remove
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredAssessments.length === 0 && (
          <div className="text-center py-12">
            <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No assessments found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>
    </div>
  );
}
