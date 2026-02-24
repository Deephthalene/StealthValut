import {
  GlobalAlertDialog,
  GlobalLayerDialog,
  GlobalToast,
} from '@/components/templates';
import { AppRoutes } from '@/router';

function App() {
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
