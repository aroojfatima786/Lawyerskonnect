import { useNavigate } from "react-router-dom";
import { FiArrowLeft } from "react-icons/fi";
import { FaUser, FaBalanceScale } from "react-icons/fa";

export default function RegisterChoice() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-lk-navy via-slate-900 to-slate-950">
      <div className="mx-auto max-w-[1200px] w-full px-5 flex flex-col flex-1">
        <div className="py-6">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-base font-medium text-white/80 transition-colors hover:text-white"
          >
            <FiArrowLeft size={22} />
            Back
          </button>
        </div>

        <div className="flex-1 flex items-center justify-center pb-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
            {/* CITIZEN */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xl shadow-slate-300/20 ring-1 ring-slate-100/90">
              <div className="flex justify-center mb-5">
                <div className="h-16 w-16 rounded-full flex items-center justify-center" style={{ backgroundColor: '#fde9c7', color: '#f0a31c' }}>
                  <FaUser size={28} />
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-800 text-center mb-3">
                For Citizens
              </h2>
              <p className="text-slate-600 text-center mb-5 text-sm leading-relaxed">
                Find verified lawyers, book consultations, manage cases, and get legal assistance for all your needs.
              </p>
              <ul className="space-y-2.5 text-slate-700 mb-6 text-sm">
                <li className="flex items-center gap-2">✔ Search & Connect with Lawyers</li>
                <li className="flex items-center gap-2">✔ Book Appointments Online</li>
                <li className="flex items-center gap-2">✔ Secure Payment Options</li>
                <li className="flex items-center gap-2">✔ 24/7 AI Legal Assistant</li>
              </ul>
              <button
                onClick={() => navigate("/auth/citizen/signup")}
                className="w-full text-white py-3.5 rounded-xl font-semibold transition-shadow hover:opacity-95"
                style={{ backgroundColor: '#f0a31c', boxShadow: '0 4px 14px rgba(240,163,28,.3)' }}
              >
                Register as Citizen →
              </button>
              <p className="text-center mt-4 text-sm text-slate-600">
                Already registered?{" "}
                <span
                  onClick={() => navigate("/auth/citizen/login")}
                  className="text-[#f0a31c] cursor-pointer font-medium hover:underline"
                >
                  Login here
                </span>
              </p>
            </div>

            {/* LAWYER */}
            <div className="rounded-2xl border border-slate-200/90 bg-white p-8 shadow-xl shadow-slate-300/20 ring-1 ring-slate-100/90">
              <div className="flex justify-center mb-5">
                <div className="h-16 w-16 rounded-full flex items-center justify-center bg-[#e0e7ff] text-[#163b63]">
                  <FaBalanceScale size={28} />
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-800 text-center mb-3">
                For Lawyers
              </h2>
              <p className="text-slate-600 text-center mb-5 text-sm leading-relaxed">
                Expand your practice, connect with clients, manage appointments, and grow your legal business efficiently.
              </p>
              <ul className="space-y-2.5 text-slate-700 mb-6 text-sm">
                <li className="flex items-center gap-2">✔ Get Verified Profile</li>
                <li className="flex items-center gap-2">✔ Receive Client Requests</li>
                <li className="flex items-center gap-2">✔ Manage Appointments</li>
                <li className="flex items-center gap-2">✔ Grow Your Practice</li>
              </ul>
              <button
                onClick={() => navigate("/auth/lawyer/signup")}
                className="w-full bg-[#163b63] text-white py-3.5 rounded-xl font-semibold hover:bg-[#0f2746] transition-colors"
              >
                Join as Lawyer →
              </button>
              <p className="text-center mt-4 text-sm text-slate-600">
                Already registered?{" "}
                <span
                  onClick={() => navigate("/auth/lawyer/login")}
                  className="text-[#163b63] cursor-pointer font-medium hover:underline"
                >
                  Login here
                </span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
