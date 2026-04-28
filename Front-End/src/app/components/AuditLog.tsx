import { useEffect, useMemo, useState } from 'react';
import { Search, Filter, Download, Shield } from 'lucide-react';
import { getAuditLogEntries } from '../api/client';
import type { AuditLogEntry } from '../api/types';

export function AuditLog() {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [filterOutcome, setFilterOutcome] = useState<string>('all');
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    let isMounted = true;

    getAuditLogEntries()
      .then((loadedLogs) => {
        if (isMounted) {
          setLogs(loadedLogs);
          setErrorMessage('');
        }
      })
      .catch((error) => {
        if (isMounted) {
          setLogs([]);
          if (error instanceof Error) {
            setErrorMessage(error.message || 'Failed to load audit logs.');
          } else {
            setErrorMessage('Failed to load audit logs.');
          }
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredLogs = logs.filter(log => {
    const matchesSearch = 
      log.actorUsername.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.resourceType.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.ipAddress.includes(searchTerm);
    
    const matchesAction = filterAction === 'all' || log.actionType === filterAction;
    const matchesOutcome = filterOutcome === 'all' || log.outcome === filterOutcome;

    return matchesSearch && matchesAction && matchesOutcome;
  });

  const actionTypes = ['all', 'create', 'read', 'update', 'delete', 'login', 'logout'];
  const outcomes = ['all', 'success', 'failure', 'denied'];
  const successCount = useMemo(() => logs.filter(l => l.outcome === 'success').length, [logs]);
  const failureCount = useMemo(() => logs.filter(l => l.outcome === 'failure').length, [logs]);
  const deniedCount = useMemo(() => logs.filter(l => l.outcome === 'denied').length, [logs]);

  const exportLogs = () => {
    const headers = [
      'audit_log_id',
      'timestamp',
      'actor_username',
      'action_type',
      'resource_type',
      'resource_id',
      'patient_id',
      'outcome',
      'ip_address',
    ];
    const rows = filteredLogs.map((log) => [
      log.auditLogId,
      log.createdAt,
      log.actorUsername,
      log.actionType,
      log.resourceType,
      log.resourceId,
      log.patientId ?? '',
      log.outcome,
      log.ipAddress,
    ]);
    const toCsvValue = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [headers, ...rows].map((row) => row.map(toCsvValue).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-blue-600" />
          <div>
            <h1>Audit Log</h1>
            <p className="text-gray-600 mt-1">{filteredLogs.length} log entries</p>
          </div>
        </div>
        <button
          type="button"
          onClick={exportLogs}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Download className="w-5 h-5" />
          <span>Export Logs</span>
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
              placeholder="Search by user, resource, or IP..."
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>

          <div>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {actionTypes.map(action => (
                <option key={action} value={action}>
                  {action === 'all' ? 'All Actions' : action.charAt(0).toUpperCase() + action.slice(1)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={filterOutcome}
              onChange={(e) => setFilterOutcome(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            >
              {outcomes.map(outcome => (
                <option key={outcome} value={outcome}>
                  {outcome === 'all' ? 'All Outcomes' : outcome.charAt(0).toUpperCase() + outcome.slice(1)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
          <p className="text-sm text-blue-700 mb-1">Total Actions</p>
          <p className="text-2xl text-blue-700">{logs.length}</p>
        </div>
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-sm text-green-700 mb-1">Successful</p>
          <p className="text-2xl text-green-700">{successCount}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm text-red-700 mb-1">Failed</p>
          <p className="text-2xl text-red-700">{failureCount}</p>
        </div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
          <p className="text-sm text-yellow-700 mb-1">Denied</p>
          <p className="text-2xl text-yellow-700">{deniedCount}</p>
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  User
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Resource
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  Outcome
                </th>
                <th className="px-6 py-3 text-left text-xs text-gray-600 uppercase tracking-wider">
                  IP Address
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredLogs.map((log) => (
                <tr key={log.auditLogId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {new Date(log.createdAt).toLocaleString()}
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm">{log.actorUsername}</p>
                  </td>
                  <td className="px-6 py-4">
                    <span className="inline-flex px-2 py-1 rounded text-xs capitalize bg-gray-100 text-gray-700">
                      {log.actionType}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm">{log.resourceType}</p>
                    {log.resourceId && (
                      <p className="text-xs text-gray-500">ID: {log.resourceId}</p>
                    )}
                    {log.patientId && (
                      <p className="text-xs text-gray-500">Patient ID: {log.patientId}</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-3 py-1 rounded-full text-xs capitalize ${
                        log.outcome === 'success'
                          ? 'bg-green-100 text-green-700'
                          : log.outcome === 'failure'
                          ? 'bg-red-100 text-red-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}
                    >
                      {log.outcome}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600 font-mono">
                    {log.ipAddress}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredLogs.length === 0 && (
          <div className="text-center py-12">
            <Filter className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No audit logs found</p>
            <p className="text-sm text-gray-500 mt-1">Try adjusting your filters</p>
          </div>
        )}
      </div>

      {/* Security Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <div className="flex items-start gap-3">
          <Shield className="w-5 h-5 text-blue-600 mt-0.5" />
          <div>
            <p className="text-sm">
              All system actions are automatically logged for security and compliance purposes.
              Audit logs are retained for 7 years per HIPAA requirements.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
