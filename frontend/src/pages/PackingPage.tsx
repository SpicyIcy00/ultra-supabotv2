/**
 * Packing — placeholder.
 *
 * Step 1 wires the route, nav entry and 'packing' page_key so role access can
 * be tested end to end. The real build lands in step 4.
 */
import React from 'react';
import { useAuthStore } from '../stores/authStore';

const PackingPage: React.FC = () => {
  const user = useAuthStore((s) => s.user);

  return (
    <div className="h-full">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white mb-1 sm:mb-2">Packing</h1>
        <p className="text-sm sm:text-base text-gray-400">
          Build and print packing lists.
        </p>
      </div>

      <div className="bg-gray-900/40 border border-[#2e303d] rounded-lg p-6">
        <p className="text-sm text-gray-300 mb-1">
          Signed in as <span className="text-white font-medium">{user?.username}</span>{' '}
          <span className="text-gray-500">({user?.role})</span>
        </p>
        <p className="text-sm text-gray-500">
          Pages you can access: {user?.allowed_pages.join(', ') || 'none'}
        </p>
        <p className="text-sm text-gray-500 mt-4">
          The packing list builder arrives in step 4.
        </p>
      </div>
    </div>
  );
};

export default PackingPage;
