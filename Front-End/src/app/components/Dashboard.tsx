import { useEffect, useMemo, useState } from 'react';
import { Users, FileText, AlertTriangle, TrendingUp } from 'lucide-react';
import { Link } from 'react-router';
import { getDashboardStats, getModels, getPatients, getRiskAssessments } from '../api/client';
import type { Model, Patient, RiskAssessment } from '../api/types';
import { useAuth } from '../context/AuthContext';
import { MODELS_ROLES, hasRoleAccess } from '../auth/permissions';

export function Dashboard() {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [assessments, setAssessments] = useState<RiskAssessment[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [activeModelAccuracy, setActiveModelAccuracy] = useState(0);
  const canViewModels = hasRoleAccess(user?.role, MODELS_ROLES);

  useEffect(() => {
    let isMounted = true;

    Promise.all([
      getPatients(),
      getRiskAssessments(),
      getDashboardStats(),
      canViewModels ? getModels() : Promise.resolve<Model[]>([]),
    ])
      .then(([loadedPatients, loadedAssessments, dashboardStats, loadedModels]) => {
        if (!isMounted) {
          return;
        }
        setPatients(loadedPatients);
        setAssessments(loadedAssessments);
        setActiveModelAccuracy(dashboardStats.activeModelAccuracy);
        setModels(loadedModels);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }
        setPatients([]);
        setAssessments([]);
        setActiveModelAccuracy(0);
        setModels([]);
      });

    return () => {
      isMounted = false;
    };
  }, [canViewModels]);

  const highRiskCount = useMemo(() => assessments.filter(a => a.riskLevel === 'high').length, [assessments]);
  const mediumRiskCount = useMemo(() => assessments.filter(a => a.riskLevel === 'medium').length, [assessments]);
  const lowRiskCount = useMemo(() => assessments.filter(a => a.riskLevel === 'low').length, [assessments]);
  const activeModel = models.find(m => m.isActive);
  const recentAssessments = assessments.slice(0, 5);
  const assessmentCount = assessments.length || 1;

  const stats = [
    {
      name: 'Total Patients',
      value: patients.length,
      icon: Users,
      color: 'bg-blue-500',
      link: '/patients'
    },
    {
      name: 'Total Assessments',
      value: assessments.length,
      icon: FileText,
      color: 'bg-green-500',
      link: '/assessments'
    },
    {
      name: 'High Risk Cases',
      value: highRiskCount,
      icon: AlertTriangle,
      color: 'bg-red-500',
      link: '/assessments'
    },
    {
      name: 'Active Model Accuracy',
      value: `${(activeModelAccuracy * 100).toFixed(1)}%`,
      icon: TrendingUp,
      color: 'bg-purple-500',
      link: canViewModels ? '/models' : '/'
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1>Dashboard</h1>
        <p className="text-gray-600 mt-1">Cardiovascular disease risk screening overview</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => (
          <Link
            key={stat.name}
            to={stat.link}
            className="bg-white p-6 rounded-xl border border-gray-200 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-600">{stat.name}</p>
                <p className="text-3xl mt-2">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="w-6 h-6 text-white" />
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Risk Distribution */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="mb-6">Risk Distribution</h2>
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">High Risk</span>
                <span className="text-sm">{highRiskCount} patients</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-red-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(highRiskCount / assessmentCount) * 100}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Medium Risk</span>
                <span className="text-sm">{mediumRiskCount} patients</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-yellow-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(mediumRiskCount / assessmentCount) * 100}%` }}
                />
              </div>
            </div>
            
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">Low Risk</span>
                <span className="text-sm">{lowRiskCount} patients</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div 
                  className="bg-green-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${(lowRiskCount / assessmentCount) * 100}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Recent Assessments */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2>Recent Assessments</h2>
            <Link to="/assessments" className="text-sm text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="space-y-3">
            {recentAssessments.map((assessment) => (
              <div
                key={assessment.assessmentId}
                className="flex items-center justify-between p-3 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1">
                  <p className="text-sm">{assessment.patientName}</p>
                  <p className="text-xs text-gray-600">
                    {new Date(assessment.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm">{(assessment.probabilityCvd * 100).toFixed(1)}%</span>
                  <span
                    className={`px-3 py-1 rounded-full text-xs ${
                      assessment.riskLevel === 'high'
                        ? 'bg-red-100 text-red-700'
                        : assessment.riskLevel === 'medium'
                        ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {assessment.riskLevel}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Active Model Info */}
      {activeModel && (
        <div className="bg-gradient-to-r from-blue-50 to-cyan-50 rounded-xl border border-blue-200 p-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="mb-2">Active Model</h2>
              <p className="text-lg mb-1">{activeModel.modelName}</p>
              <p className="text-sm text-gray-600">Version {activeModel.modelVersion} • {activeModel.algorithm}</p>
            </div>
            {canViewModels && (
              <Link
                to="/models"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                View Details
              </Link>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
            <div>
              <p className="text-xs text-gray-600">AUC</p>
              <p className="text-lg mt-1">{(activeModel.auc * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Accuracy</p>
              <p className="text-lg mt-1">{(activeModel.accuracy * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Precision</p>
              <p className="text-lg mt-1">{(activeModel.precision * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">Recall</p>
              <p className="text-lg mt-1">{(activeModel.recall * 100).toFixed(1)}%</p>
            </div>
            <div>
              <p className="text-xs text-gray-600">F1 Score</p>
              <p className="text-lg mt-1">{(activeModel.f1Score * 100).toFixed(1)}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
