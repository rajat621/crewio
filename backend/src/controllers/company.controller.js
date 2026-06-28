import Company from '../models/Company.js';
import User from '../models/User.js';

const getAuthenticatedUser = async (req) => {
  const userId = req.user?.userId;
  if (!userId) return null;
  return User.findById(userId).populate('company');
};

const getAuthenticatedOwnerId = (req, user) => req.user?.ownerId || user?._id || req.user?.userId || null;

const buildEmptyOwnerCompany = (ownerId) => ({
  owner: ownerId,
  ownerId,
  companyRole: 'owner',
  isOwner: true,
  name: '',
  companyLegalName: '',
  trn: '',
  websiteLink: '',
  address: '',
  city: '',
  nationality: '',
  contactEmail: '',
  mobileNumber: '',
  countryCode: '',
  onboardingCompleted: false,
});

const ensureOwnerCompany = async (user, req) => {
  const ownerId = getAuthenticatedOwnerId(req, user);
  if (!ownerId) return null;

  let company = await Company.findOne({
    ownerId,
    companyRole: 'owner',
    isOwner: true,
  });

  if (!company) {
    company = await Company.create(buildEmptyOwnerCompany(ownerId));
  }

  if (String(company.owner || '') !== String(ownerId)) {
    company.owner = ownerId;
    await company.save();
  }

  if (!user.company || String(user.company?._id || user.company) !== String(company._id)) {
    user.company = company._id;
  }

  const completed = Boolean(company.onboardingCompleted);
  if (user.onboardingCompleted !== completed) {
    user.onboardingCompleted = completed;
  }

  await user.save();
  return company;
};

const estimateDataUrlBytes = (dataUrl) => {
  if (!dataUrl || typeof dataUrl !== 'string') return 0;
  const base64Part = dataUrl.split(',')[1];
  return base64Part ? Math.ceil((base64Part.length * 3) / 4) : 0;
};

const validateAssetField = (fieldName, value) => {
  if (!value) return null;

  const maxSizeImage = 5 * 1024 * 1024;
  const maxSizePdf = 10 * 1024 * 1024;

  if (!value.startsWith('data:')) {
    return `${fieldName} must be provided as a data URL string`;
  }

  const bytes = estimateDataUrlBytes(value);
  const mimeType = value.split(';')[0].replace('data:', '');

  if (mimeType.startsWith('image/')) {
    if (bytes > maxSizeImage) {
      return `${fieldName} image size exceeds 5MB limit`;
    }
  } else if (mimeType === 'application/pdf') {
    if (bytes > maxSizePdf) {
      return `${fieldName} PDF size exceeds 10MB limit`;
    }
  } else {
    return `${fieldName} has unsupported MIME type: ${mimeType}`;
  }

  return null;
};

export const createCompany = async (req, res) => {
  try {
    const ownerId =
  req.user?.ownerId ||
  req.employee?.ownerId;
const user = req.user;

if (!user) {
  return res.status(401).json({
    message: 'User not authenticated'
  });
}

if (!ownerId) {
  return res.status(401).json({
    message: 'User not authenticated'
  });
}
    const { name, trn, websiteLink, stamp, invoiceTemplate, signature,
      address, telephoneNumber, poBox, faxNumber, city } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Company name is required' });
    }

    // Validate asset fields
    let assetError = validateAssetField('stamp', stamp);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('invoiceTemplate', invoiceTemplate);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('signature', signature);
    if (assetError) return res.status(400).json({ message: assetError });

    const company = new Company({
      name,
      trn,
      websiteLink,
      stamp,
      invoiceTemplate,
      signature,
      owner: user.userId,
      ownerId: user.ownerId,
      createdBy: user.userId,
      companyRole: 'client',
      isOwner: false,
      ...(address !== undefined && { address }),
      ...(telephoneNumber !== undefined && { telephoneNumber }),
      ...(poBox !== undefined && { poBox }),
      ...(faxNumber !== undefined && { faxNumber }),
      ...(city !== undefined && { city }),
    });

    await company.save();
    console.log('Create company: ownerId=', user.ownerId, 'createdBy=', user.userId, 'companyId=', company._id);

    res.status(201).json({
      message: 'Company created successfully',
      data: company,
    });
  } catch (error) {
    console.error('Create company error:', error);
    res.status(500).json({ message: 'Failed to create company', error: error.message });
  }
};

export const updateOwnerCompany = async (req, res) => {
  try {
    console.log('updateOwnerCompany payload:', JSON.stringify(req.body));
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const {
      name,
      trn,
      websiteLink,
      stamp,
      invoiceTemplate,
      signature,
      companyRole,
      isOwner,
      owner,
      ownerId,
      _id,
      ...otherFields
    } = req.body;

    // Validate asset fields
    let assetError = validateAssetField('stamp', stamp);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('invoiceTemplate', invoiceTemplate);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('signature', signature);
    if (assetError) return res.status(400).json({ message: assetError });

    const updateData = {
      ...otherFields,
      ...(name !== undefined && { name }),
      ...(trn !== undefined && { trn }),
      ...(websiteLink !== undefined && { websiteLink }),
      ...(stamp !== undefined && { stamp }),
      ...(invoiceTemplate !== undefined && { invoiceTemplate }),
      ...(signature !== undefined && { signature }),
    };

    const authUser = user;
    const authenticatedOwnerId = getAuthenticatedOwnerId(req, authUser);
    let company = await Company.findOne({
      ownerId: authenticatedOwnerId,
      companyRole: 'owner',
      isOwner: true,
    });

    if (!company) {
      company = new Company({
        ...buildEmptyOwnerCompany(authenticatedOwnerId),
        ...otherFields,
        ...(name !== undefined && { name }),
        ...(trn !== undefined && { trn }),
        ...(websiteLink !== undefined && { websiteLink }),
        ...(stamp !== undefined && { stamp }),
        ...(invoiceTemplate !== undefined && { invoiceTemplate }),
        ...(signature !== undefined && { signature }),
      });
    } else {
      Object.assign(company, updateData);
    }

    company.isOwner = true;
    company.companyRole = 'owner';
    company.owner = authenticatedOwnerId;
    company.ownerId = authenticatedOwnerId;
    await company.save();

    if (!authUser.company || String(authUser.company?._id || authUser.company) !== String(company._id)) {
      authUser.company = company._id;
    }
    authUser.onboardingCompleted = Boolean(company.onboardingCompleted);
    await authUser.save();

    res.json({
      message: 'Company profile updated successfully',
      data: company,
    });
  } catch (error) {
    console.error('Update owner company error:', error);
    res.status(500).json({ message: 'Failed to update company', error: error.message });
  }
};

export const getOwnerCompany = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const ownerId = getAuthenticatedOwnerId(req, user);
    let company = await Company.findOne({
      ownerId,
      companyRole: 'owner',
      isOwner: true,
    });

    if (!company && user.company) {
      company = await Company.findOneAndUpdate(
        { _id: user.company._id || user.company, ownerId },
        { isOwner: true, companyRole: 'owner', owner: ownerId, ownerId },
        { new: true }
      );
    }

    if (!company) {
      company = await ensureOwnerCompany(user, req);
    }

    if (!user.company || String(user.company?._id || user.company) !== String(company._id)) {
      user.company = company._id;
      await user.save();
    }

    res.json({
      data: company,
    });
  } catch (error) {
    console.error('Get owner company error:', error);
    res.status(500).json({ message: 'Failed to fetch company', error: error.message });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { id } = req.params;
    const updateData = req.body;

    const company = await Company.findOneAndUpdate(
      {
        _id: id,
        ownerId: user.ownerId,
        $or: [
          { companyRole: 'client' },
          { companyRole: { $exists: false }, isOwner: { $ne: true } },
        ],
      },
      { ...updateData, companyRole: 'client', isOwner: false },
      { new: true }
    );
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }

    res.json({
      message: 'Company updated successfully',
      data: company,
    });
  } catch (error) {
    console.error('Update company error:', error);
    res.status(500).json({ message: 'Failed to update company', error: error.message });
  }
};

export const createClientCompany = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const { name, trn, stamp, invoiceTemplate, signature,
      address, telephoneNumber, poBox, faxNumber, city } = req.body;

    if (!name) {
      return res.status(400).json({ message: 'Company name is required' });
    }

    // Validate asset fields
    let assetError = validateAssetField('stamp', stamp);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('invoiceTemplate', invoiceTemplate);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('signature', signature);
    if (assetError) return res.status(400).json({ message: assetError });

    const ownerId = req.user?.ownerId || user._id;
    const company = new Company({
      name,
      trn,
      stamp,
      invoiceTemplate,
      signature,
      owner: user._id,
      ownerId,
      createdBy: req.user?.userId || user._id,
      companyRole: 'client',
      isOwner: false,
      ...(address !== undefined && { address }),
      ...(telephoneNumber !== undefined && { telephoneNumber }),
      ...(poBox !== undefined && { poBox }),
      ...(faxNumber !== undefined && { faxNumber }),
      ...(city !== undefined && { city }),
    });

    await company.save();
    console.log('Create client company: ownerId=', ownerId, 'createdBy=', req.user?.userId || user._id, 'companyId=', company._id);

    res.status(201).json({
      message: 'Client company created successfully',
      data: company,
    });
  } catch (error) {
    console.error('Create client company error:', error);
    res.status(500).json({ message: 'Failed to create company', error: error.message });
  }
};

export const getCompanies = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const ownerId = req.user?.ownerId || user._id;

    const companies = await Company.find({
      ownerId,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    }).sort({ createdAt: -1 });
    res.json({ data: companies });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ message: 'Failed to fetch companies', error: error.message });
  }
};

export const getCompany = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const ownerId = req.user?.ownerId || user._id;
    const company = await Company.findOne({ _id: req.params.id, ownerId });
    if (!company) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json({ data: company });
  } catch (error) {
    console.error('Get company error:', error);
    res.status(500).json({ message: 'Failed to fetch company', error: error.message });
  }
};

export const deleteCompany = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const deleted = await Company.findOneAndDelete({
      _id: req.params.id,
      ownerId: req.user?.ownerId || user._id,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    });
    if (!deleted) {
      return res.status(404).json({ message: 'Company not found' });
    }
    res.json({ message: 'Company deleted successfully' });
  } catch (error) {
    console.error('Delete company error:', error);
    res.status(500).json({ message: 'Failed to delete company', error: error.message });
  }
};

export const getClientCompanies = async (req, res) => {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const ownerId = req.user?.ownerId || user._id;

    const companies = await Company.find({
      ownerId,
      $or: [
        { companyRole: 'client' },
        { companyRole: { $exists: false }, isOwner: { $ne: true } },
      ],
    }).sort({ createdAt: -1 });
    console.log('getClientCompanies: ownerId=', ownerId, 'found=', (companies || []).length);
    res.json({ data: companies });
  } catch (error) {
    console.error('Get client companies error:', error);
    res.status(500).json({ message: 'Failed to fetch client companies', error: error.message });
  }
};
