import {
  GlobalAlertDialog,
  GlobalLayerDialog,
  GlobalToast,
} from '@/components/templates';
import GlobalUploadIndicator from '@/components/organisms/GlobalUploadIndicator/GlobalUploadIndicator';
import { useSystemTray } from '@/hooks/useSystemTray';
import { AppRoutes } from '@/router';

function App() {
  useSystemTray();

  return (
    <>
      <GlobalLayerDialog />
      <GlobalAlertDialog />
      <GlobalToast />
      <GlobalUploadIndicator />
      <AppRoutes />
    </>
  );
}

export default App;
