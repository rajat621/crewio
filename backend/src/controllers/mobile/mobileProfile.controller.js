import Employee from '../../models/Employee.js';

const PROFILE_SAFE_SELECT = '-appPassword -owner -expenses -expenseReceipts -passportCopy -emiratesIdCopy -laborCardCopy -medicalCertificateCopy -residenceIdCopy -contractPaperCopy';
const ALLOWED_PROFILE_UPDATE_FIELDS = ['avatar', 'mobile', 'mobileNumber', 'countryCode', 'address', 'city'];

export const getMyProfile = async (req, res) => {
  try {
    const employee = await Employee.findById(req.employee._id).select(PROFILE_SAFE_SELECT);
    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    return res.json({ message: 'Profile retrieved', data: employee });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to fetch profile', error: error.message });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const updates = {};
    for (const field of ALLOWED_PROFILE_UPDATE_FIELDS) {
      if (Object.prototype.hasOwnProperty.call(req.body, field)) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields provided for update' });
    }

    const employee = await Employee.findByIdAndUpdate(
      req.employee._id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select(PROFILE_SAFE_SELECT);

    if (!employee) {
      return res.status(404).json({ message: 'Employee not found' });
    }

    return res.json({ message: 'Profile updated', data: employee });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to update profile', error: error.message });
  }
};

export default {
  getMyProfile,
  updateMyProfile,
};
