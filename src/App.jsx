import StudioAsh from "./StudioAsh.jsx";
import { AuthProvider } from "./auth/AuthProvider.jsx";
import { useAuth } from "./auth/useAuth.js";
import { Onboarding } from "./auth/Onboarding.jsx";
import { SignIn } from "./auth/SignIn.jsx";
import { JoinTeam } from "./scope/JoinTeam.jsx";
import { ScopeProvider } from "./scope/ScopeProvider.jsx";

function Gate() {
  const { session, profile, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--color-text-tertiary)",
          fontSize: 12,
        }}
      >
        ···
      </div>
    );
  }

  if (!session) return <SignIn />;
  if (!profile?.onboarding_completed_at) return <Onboarding />;
  return (
    <ScopeProvider>
      <JoinTeam />
      <StudioAsh />
    </ScopeProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
