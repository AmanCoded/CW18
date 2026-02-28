import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Card } from '../types';

interface AddCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (card: CardFormData) => void;
  onUpdate?: (cardId: number, data: CardFormData) => void;
  defaultToWantList?: boolean;
  editCard?: Card | null;
}

export interface CardFormData {
  year: number;
  set_name: string;
  parallel_rarity: string;
  date_acquired: string | null;
  is_graded: boolean;
  grading_company: string | null;
  grade: number | null;
  cost_basis: number | null;
  authenticity_guaranteed: boolean;
}

const COMMON_SETS = [
  "Donruss Optic - Rated Rookie 201",
  "Prizm - Rookie",
  "Select - Rookie",
  "National Treasures Rookie",
  "Topps Finest Rookie Auto",
  "Panini Absolute",
  "Immaculate",
  "Bowman Chrome",
  "Other"
];

const GRADING_COMPANIES = ["PSA", "SGC", "BGS", "CGC"];

const defaultFormData: CardFormData = {
  year: 2024,
  set_name: "Donruss Optic - Rated Rookie 201",
  parallel_rarity: "",
  date_acquired: new Date().toISOString().split('T')[0],
  is_graded: false,
  grading_company: null,
  grade: null,
  cost_basis: null,
  authenticity_guaranteed: false
};

export function AddCardModal({ isOpen, onClose, onAdd, onUpdate, defaultToWantList = false, editCard }: AddCardModalProps) {
  const isEditMode = !!editCard;

  const [formData, setFormData] = useState<CardFormData>(defaultFormData);
  const [customSet, setCustomSet] = useState("");
  const [isWantList, setIsWantList] = useState(defaultToWantList);

  // Reset form when modal opens or editCard changes
  useEffect(() => {
    if (isOpen) {
      if (editCard) {
        const setInList = COMMON_SETS.includes(editCard.set_name);
        setFormData({
          year: editCard.year,
          set_name: setInList ? editCard.set_name : "Other",
          parallel_rarity: editCard.parallel_rarity,
          date_acquired: editCard.date_acquired,
          is_graded: editCard.is_graded,
          grading_company: editCard.grading_company,
          grade: editCard.grade,
          cost_basis: editCard.cost_basis,
          authenticity_guaranteed: editCard.authenticity_guaranteed,
        });
        setCustomSet(setInList ? "" : editCard.set_name);
        setIsWantList(!editCard.is_owned);
      } else {
        setFormData({
          ...defaultFormData,
          date_acquired: defaultToWantList ? null : new Date().toISOString().split('T')[0],
        });
        setCustomSet("");
        setIsWantList(defaultToWantList);
      }
    }
  }, [isOpen, editCard, defaultToWantList]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const cardData: CardFormData = {
      ...formData,
      set_name: formData.set_name === "Other" ? customSet : formData.set_name,
      date_acquired: isWantList ? null : formData.date_acquired,
      grading_company: formData.is_graded ? formData.grading_company : null,
      grade: formData.is_graded ? formData.grade : null,
    };

    if (isEditMode && editCard && onUpdate) {
      onUpdate(editCard.id, cardData);
    } else {
      onAdd(cardData);
    }

    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-bears-navy-light border border-bears-gray/30 rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-4 border-b border-bears-gray/20">
          <h2 className="text-white font-semibold text-lg">
            {isEditMode ? 'Edit Card' : 'Add New Card'}
          </h2>
          <button onClick={onClose} className="p-1 hover:bg-bears-gray/20 rounded">
            <X className="w-5 h-5 text-bears-gray" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Card Type Toggle - hidden in edit mode */}
          {!isEditMode && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setIsWantList(false)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  !isWantList
                    ? 'bg-bears-orange text-white'
                    : 'bg-bears-navy text-bears-gray hover:text-white'
                }`}
              >
                Add to Collection
              </button>
              <button
                type="button"
                onClick={() => setIsWantList(true)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
                  isWantList
                    ? 'bg-bears-orange text-white'
                    : 'bg-bears-navy text-bears-gray hover:text-white'
                }`}
              >
                Add to Want List
              </button>
            </div>
          )}

          {/* Year */}
          <div>
            <label className="block text-bears-gray text-sm mb-1">Year</label>
            <input
              type="number"
              value={formData.year}
              onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
              className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
              min={2020}
              max={2030}
            />
          </div>

          {/* Set Name */}
          <div>
            <label className="block text-bears-gray text-sm mb-1">Set</label>
            <select
              value={formData.set_name}
              onChange={(e) => setFormData({ ...formData, set_name: e.target.value })}
              className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
            >
              {COMMON_SETS.map((set) => (
                <option key={set} value={set}>{set}</option>
              ))}
            </select>
            {formData.set_name === "Other" && (
              <input
                type="text"
                value={customSet}
                onChange={(e) => setCustomSet(e.target.value)}
                placeholder="Enter set name..."
                className="w-full mt-2 bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
                required
              />
            )}
          </div>

          {/* Parallel/Rarity */}
          <div>
            <label className="block text-bears-gray text-sm mb-1">Parallel / Rarity</label>
            <input
              type="text"
              value={formData.parallel_rarity}
              onChange={(e) => setFormData({ ...formData, parallel_rarity: e.target.value })}
              placeholder="e.g., Holo, Fire, Gold /10, Black 1/1"
              className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
              required
            />
          </div>

          {/* Graded Toggle */}
          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={formData.is_graded}
                onChange={(e) => setFormData({ ...formData, is_graded: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-bears-navy rounded-full peer peer-checked:bg-bears-orange peer-focus:ring-2 peer-focus:ring-bears-orange/50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
            </label>
            <span className="text-white text-sm">Graded</span>
          </div>

          {/* Grading Details */}
          {formData.is_graded && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-bears-gray text-sm mb-1">Company</label>
                <select
                  value={formData.grading_company || ""}
                  onChange={(e) => setFormData({ ...formData, grading_company: e.target.value })}
                  className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
                >
                  <option value="">Select...</option>
                  {GRADING_COMPANIES.map((co) => (
                    <option key={co} value={co}>{co}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-bears-gray text-sm mb-1">Grade</label>
                <input
                  type="number"
                  value={formData.grade || ""}
                  onChange={(e) => setFormData({ ...formData, grade: parseFloat(e.target.value) })}
                  placeholder="10"
                  step="0.5"
                  min="1"
                  max="10"
                  className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
                />
              </div>
            </div>
          )}

          {/* Collection-only fields */}
          {!isWantList && (
            <>
              {/* Date Acquired */}
              <div>
                <label className="block text-bears-gray text-sm mb-1">Date Acquired</label>
                <input
                  type="date"
                  value={formData.date_acquired || ""}
                  onChange={(e) => setFormData({ ...formData, date_acquired: e.target.value })}
                  className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
                  required={!isWantList}
                />
              </div>

              {/* Cost Basis */}
              <div>
                <label className="block text-bears-gray text-sm mb-1">Cost Basis ($)</label>
                <input
                  type="number"
                  value={formData.cost_basis || ""}
                  onChange={(e) => setFormData({ ...formData, cost_basis: parseFloat(e.target.value) })}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  className="w-full bg-bears-navy border border-bears-gray/30 rounded-lg px-3 py-2 text-white focus:border-bears-orange focus:outline-none"
                />
              </div>

              {/* Authenticity Guaranteed */}
              <div className="flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.authenticity_guaranteed}
                    onChange={(e) => setFormData({ ...formData, authenticity_guaranteed: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-bears-navy rounded-full peer peer-checked:bg-bears-orange peer-focus:ring-2 peer-focus:ring-bears-orange/50 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full"></div>
                </label>
                <span className="text-white text-sm">Authenticity Guaranteed</span>
              </div>
            </>
          )}

          {/* Submit Button */}
          <button
            type="submit"
            className="w-full py-3 bg-bears-orange hover:bg-bears-orange-light text-white font-semibold rounded-lg transition-colors"
          >
            {isEditMode
              ? 'Save Changes'
              : isWantList
                ? 'Add to Want List'
                : 'Add to Collection'
            }
          </button>
        </form>
      </div>
    </div>
  );
}
