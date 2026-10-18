import { useNavigate } from 'react-router';
import { JoinScreen } from '@/screens/JoinScreen';

/** `/` — kod girişi: kod girilince katılımcı odasına geçilir. */
export default function JoinPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col">
      <JoinScreen
        onEnter={({ code }) => {
          if (code) navigate(`/oda/${code}`);
        }}
      />
    </div>
  );
}
