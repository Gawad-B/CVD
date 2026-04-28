import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Search, Plus, Calendar, Mail, Phone, User } from 'lucide-react';
import { AddPatientModal } from './AddPatientModal';
import { createPatient, getPatients } from '../api/client';
import type { Patient } from '../api/types';

export function PatientsList() {
  const [searchTerm, setSearchTerm] = useState('');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    getPatients()
      .then((loadedPatients) => {
        if (isMounted) {
          setPatients(loadedPatients);
        }
      })
      .catch(() => {
        if (isMounted) {
          setPatients([]);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const filteredPatients = patients.filter(patient =>
    patient.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.externalPatientCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    patient.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1>Patients</h1>
          <p className="text-gray-600 mt-1">{filteredPatients.length} total patients</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Add Patient</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, patient code, or email..."
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        />
      </div>

      {/* Patients Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filteredPatients.map((patient) => (
          <Link
            key={patient.patientId}
            to={`/patients/${patient.patientId}`}
            className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-shadow"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  patient.sex === 'male' ? 'bg-blue-100' : 'bg-pink-100'
                }`}>
                  <User className={`w-6 h-6 ${
                    patient.sex === 'male' ? 'text-blue-600' : 'text-pink-600'
                  }`} />
                </div>
                <div>
                  <p className="font-medium">{patient.firstName} {patient.lastName}</p>
                  <p className="text-sm text-gray-600">{patient.externalPatientCode}</p>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Calendar className="w-4 h-4" />
                <span>{calculateAge(patient.dateOfBirth)} years old ({new Date(patient.dateOfBirth).toLocaleDateString()})</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Mail className="w-4 h-4" />
                <span className="truncate">{patient.email}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Phone className="w-4 h-4" />
                <span>{patient.phone}</span>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500">
                Added {new Date(patient.createdAt).toLocaleDateString()}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {filteredPatients.length === 0 && (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No patients found</p>
          <p className="text-sm text-gray-500 mt-1">Try adjusting your search criteria</p>
        </div>
      )}

      <AddPatientModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onAdd={async (patient) => {
          try {
            const created = await createPatient({
              firstName: patient.firstName,
              lastName: patient.lastName,
              dateOfBirth: patient.dateOfBirth,
              sex: patient.sex,
              email: patient.email,
              phone: patient.phone,
            });
            setPatients((prev) => [created, ...prev]);
          } catch {
            const refreshed = await getPatients().catch(() => []);
            setPatients(refreshed);
          }
        }}
      />
    </div>
  );
}
