import LayerDialog from '@/components/molecules/LayerDialog';
import { useLayerDialogStore } from '@/stores/useLayerDialogStore';

const BASE_Z_INDEX = 50;

function GlobalLayerDialog() {
  const dialogs = useLayerDialogStore((state) => state.dialogs);

  if (dialogs.length === 0) return null;

  return (
    <>
      {dialogs.map((dialog, index) => {
        const zIndex = BASE_Z_INDEX + index * 10;
        return (
          <LayerDialog
            key={dialog.id}
            item={dialog}
            zIndex={zIndex}
            onClose={() =>
              useLayerDialogStore.getState().closeDialog(dialog.id)
            }
          />
        );
      })}
    </>
  );
}

export default GlobalLayerDialog;
