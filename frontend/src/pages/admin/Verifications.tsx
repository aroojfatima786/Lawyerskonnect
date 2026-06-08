import { useEffect, useState } from 'react';
import { FiCheckCircle, FiXCircle, FiEye, FiFileText, FiExternalLink } from 'react-icons/fi';
import { identityApi } from '../../services/api';
import { Card, Button, Badge, Avatar, Modal, Textarea } from '../../components/ui';
import { useToast } from '../../components/ui/Toast';
import type { IdentityDocument } from '../../types';

const DOC_LABELS: Record<string, string> = {
  cnic: 'CNIC (legacy)',
  cnic_front: 'CNIC front',
  cnic_back: 'CNIC back',
  bar_certificate: 'Bar Council certificate',
};

function docUrl(doc: IdentityDocument) {
  return (doc as any).secureUrl || doc.fileUrl;
}

function isImageDoc(doc: IdentityDocument) {
  const t = String(doc.documentType);
  return t.includes('cnic') || /\.(jpg|jpeg|png|webp)$/i.test(doc.fileUrl || '');
}

function adminDocuments(docs: IdentityDocument[] | undefined) {
  return (docs || []).filter((d) => String(d.documentType) !== 'selfie');
}

export default function AdminVerifications() {
  const toast = useToast();
  const [verifications, setVerifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVerification, setSelectedVerification] = useState<any>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    void loadPendingVerifications();
  }, []);

  const loadPendingVerifications = async () => {
    setLoading(true);
    try {
      const response: any = await identityApi.getPendingVerifications();
      const list = Array.isArray(response?.verifications)
        ? response.verifications
        : Array.isArray(response?.data?.verifications)
          ? response.data.verifications
          : [];
      setVerifications(list);
    } catch (error) {
      console.error('Failed to load verifications:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (userId: string) => {
    setProcessing(true);
    try {
      await identityApi.reviewVerification(userId, 'approve');
      toast.success('Verification approved');
      await loadPendingVerifications();
      setSelectedVerification(null);
    } catch (error: any) {
      toast.error(error.message || 'Failed to approve');
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedVerification || !rejectReason) return;
    setProcessing(true);
    try {
      await identityApi.reviewVerification(selectedVerification.userId, 'reject', rejectReason);
      toast.success('Verification rejected');
      setShowRejectModal(false);
      setRejectReason('');
      setSelectedVerification(null);
      await loadPendingVerifications();
    } catch (error: any) {
      toast.error(error.message || 'Failed to reject');
    } finally {
      setProcessing(false);
    }
  };

  const reviewDocs = adminDocuments(selectedVerification?.documents);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Identity verifications</h1>
        <p className="text-slate-500">
          {verifications.length} pending — review CNIC documents{verifications.some((v) => v.role === 'lawyer') ? ' and Bar Council certificates' : ''}
        </p>
      </div>

      {loading ? (
        <div className="grid gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse h-24"><div /></Card>
          ))}
        </div>
      ) : verifications.length === 0 ? (
        <Card className="py-12 text-center">
          <FiCheckCircle className="mx-auto mb-4 text-5xl text-green-500" />
          <h3 className="text-xl font-semibold text-slate-700">All caught up</h3>
          <p className="text-slate-500">No pending verifications</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {verifications.map((verification) => (
            <Card key={verification.userId}>
              <div className="flex flex-col gap-4 md:flex-row md:items-center">
                <Avatar name={verification.fullName} size="lg" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-bold text-slate-800">{verification.fullName || 'N/A'}</h3>
                    <Badge variant="secondary" size="sm" className="capitalize">
                      {verification.role}
                    </Badge>
                  </div>
                  <p className="text-sm text-slate-500">{verification.email}</p>
                  <p className="text-sm text-slate-500">CNIC: {verification.cnic || '—'}</p>
                  {verification.barCouncilNumber && (
                    <p className="text-sm text-slate-500">Bar Council: {verification.barCouncilNumber}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setSelectedVerification(verification)} leftIcon={<FiEye />}>
                    Review
                  </Button>
                  <Button size="sm" onClick={() => handleApprove(verification.userId)} leftIcon={<FiCheckCircle />}>
                    Approve
                  </Button>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => {
                      setSelectedVerification(verification);
                      setShowRejectModal(true);
                    }}
                    leftIcon={<FiXCircle />}
                  >
                    Reject
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={!!selectedVerification && !showRejectModal}
        onClose={() => setSelectedVerification(null)}
        title="Verification review"
        size="xl"
      >
        {selectedVerification && (
          <div className="space-y-6 p-2">
            <div className="flex items-center gap-4">
              <Avatar name={selectedVerification.fullName} size="xl" />
              <div>
                <h3 className="text-xl font-bold">{selectedVerification.fullName}</h3>
                <p className="text-slate-500">{selectedVerification.email}</p>
                <p className="text-sm text-slate-500 capitalize">{selectedVerification.role}</p>
                <p className="text-sm text-slate-500">Entered CNIC: {selectedVerification.cnic || '—'}</p>
                {selectedVerification.barCouncilNumber && (
                  <p className="text-sm text-slate-500">Bar Council: {selectedVerification.barCouncilNumber}</p>
                )}
              </div>
            </div>

            <p className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
              OCR and live selfie checks were completed automatically before this request reached you. Please verify the CNIC
              {selectedVerification.role === 'lawyer' ? ' and Bar Council certificate' : ''} below.
            </p>

            <div>
              <h4 className="mb-3 font-semibold text-slate-800">Documents to review</h4>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {reviewDocs.length === 0 ? (
                  <p className="text-sm text-slate-500 sm:col-span-3">No documents available</p>
                ) : (
                  reviewDocs.map((doc: IdentityDocument) => (
                    <div key={doc._id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                      <div className="border-b border-slate-100 px-3 py-2 text-sm font-medium">
                        {DOC_LABELS[doc.documentType] || doc.documentType}
                      </div>
                      {isImageDoc(doc) ? (
                        <a href={docUrl(doc)} target="_blank" rel="noreferrer">
                          <img src={docUrl(doc)} alt={doc.documentType} className="h-40 w-full object-cover bg-slate-100" />
                        </a>
                      ) : (
                        <div className="flex h-40 items-center justify-center bg-slate-50">
                          <FiFileText className="text-3xl text-slate-300" />
                        </div>
                      )}
                      <div className="p-2">
                        <Button variant="outline" size="sm" className="w-full" onClick={() => window.open(docUrl(doc), '_blank')} leftIcon={<FiExternalLink />}>
                          Open
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex gap-3 border-t pt-4">
              <Button onClick={() => handleApprove(selectedVerification.userId)} isLoading={processing} className="flex-1">
                Approve
              </Button>
              <Button variant="danger" onClick={() => setShowRejectModal(true)} className="flex-1">
                Reject
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject verification">
        <div className="space-y-4 p-2">
          <Textarea label="Rejection reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />
          <Button variant="danger" onClick={() => void handleReject()} isLoading={processing} disabled={!rejectReason.trim()} className="w-full">
            Confirm reject
          </Button>
        </div>
      </Modal>
    </div>
  );
}
