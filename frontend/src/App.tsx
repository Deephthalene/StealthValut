import {
  GlobalAlertDialog,
  GlobalLayerDialog,
  GlobalToast,
} from '@/components/templates';
import { useSystemTray } from '@/hooks/useSystemTray';
import { AppRoutes } from '@/router';

function App() {
  useSystemTray();

  return (
    <>
      <GlobalLayerDialog />
      <GlobalAlertDialog />
      <GlobalToast />
      <AppRoutes />
    </>
  );
}

export default App;
