import React from 'react';
import type { SACItem } from '../../types/index';

interface FacultyRoomBarProps {
  rooms: SACItem[];
  onFacultyOccupy: (roomId: string, roomName: string) => void;
  onReleaseRoom: (roomId: string, roomName: string) => void;
  disabled: boolean;
}

export const FacultyRoomBar: React.FC<FacultyRoomBarProps> = ({
  rooms,
  onFacultyOccupy,
  onReleaseRoom,
  disabled
}) => {
  if (rooms.length === 0) return null;

  const formatTime = (val?: string | null) => {
    if (!val) return '';
    const d = new Date(val);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  return (
    <section className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
      <div className="px-4 py-2.5 bg-zinc-50/80 border-b border-zinc-200 flex items-center justify-between">
        <h2 className="text-xs font-semibold text-zinc-800">
          Activity Room Keys & Faculty Override
        </h2>
        <span className="text-[11px] text-zinc-500">
          Direct desk occupancy control
        </span>
      </div>

      <div className="divide-y divide-zinc-100">
        {rooms.map((room) => {
          const isAvailable = room.isAvailable && room.availableQty > 0;
          const occupiedSince = room.occupiedSince || (room as any).occupied_since;
          const isStudentHeld = Boolean(room.hasActiveStudentCheckout && !isAvailable);

          return (
            <div
              key={room.id}
              className="px-4 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2.5">
                <span
                  className={`h-1.5 w-1.5 rounded-full shrink-0 ${
                    isAvailable ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}
                />
                <span className="text-xs font-medium text-zinc-900">{room.name}</span>
                <span className="text-[11px] text-zinc-400">·</span>
                <span className="text-xs text-zinc-500 tabular-nums">
                  {isAvailable
                    ? 'Key in desk locker'
                    : isStudentHeld
                      ? `Issued to student${occupiedSince ? ` (${formatTime(occupiedSince)})` : ''}`
                      : `Faculty / event session${occupiedSince ? ` since ${formatTime(occupiedSince)}` : ''}`}
                </span>
              </div>

              <div className="flex items-center justify-end">
                {isAvailable ? (
                  <button
                    onClick={() => onFacultyOccupy(room.id, room.name)}
                    disabled={disabled}
                    className="px-2.5 py-1 rounded-md text-xs font-medium border border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800 transition disabled:opacity-50"
                  >
                    Occupy (Faculty / Event)
                  </button>
                ) : isStudentHeld ? (
                  <span className="text-[11px] text-zinc-400">
                    Return via Active Register below
                  </span>
                ) : (
                  <button
                    onClick={() => onReleaseRoom(room.id, room.name)}
                    disabled={disabled}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-white transition disabled:opacity-50"
                  >
                    Release Key
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

