import type { ReactNode } from 'react';
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props<T extends { id: string }> {
  items: T[];
  alReordenar(nuevos: T[]): void;
  render(item: T, indice: number): ReactNode;
}

function Celda<T extends { id: string }>({ item, indice, render }: { item: T; indice: number; render: Props<T>['render'] }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  return (
    <div
      ref={setNodeRef}
      className={'celda-pagina' + (isDragging ? ' arrastrando' : '')}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="celda-pagina"
      {...attributes}
      {...listeners}
    >
      {render(item, indice)}
    </div>
  );
}

/** Cuadrícula de miniaturas reordenable por arrastre. */
export function CuadriculaOrdenable<T extends { id: string }>({ items, alReordenar, render }: Props<T>) {
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const alTerminar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const a = items.findIndex((i) => i.id === e.active.id);
    const b = items.findIndex((i) => i.id === e.over!.id);
    if (a >= 0 && b >= 0) alReordenar(arrayMove(items, a, b));
  };
  return (
    <DndContext sensors={sensores} collisionDetection={closestCenter} onDragEnd={alTerminar}>
      <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
        <div className="cuadricula-paginas">
          {items.map((it, i) => (
            <Celda key={it.id} item={it} indice={i} render={render} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
