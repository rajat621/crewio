import Company from '../models/Company.js';
import User from '../models/User.js';

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
    const { name, trn, websiteLink, stamp, invoiceTemplate, signature } = req.body;

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
    });

    await company.save();

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
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { name, trn, websiteLink, stamp, invoiceTemplate, signature, companyRole, ...otherFields } = req.body;

    // Validate asset fields
    let assetError = validateAssetField('stamp', stamp);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('invoiceTemplate', invoiceTemplate);
    if (assetError) return res.status(400).json({ message: assetError });

    assetError = validateAssetField('signature', signature);
    if (assetError) return res.status(400).json({ message: assetError });

    const updateData = {
      ...otherFields,
      ...(name && { name }),
      ...(trn && { trn }),
      ...(websiteLink !== undefined && { websiteLink }),
      ...(stamp !== undefined && { stamp }),
      ...(invoiceTemplate !== undefined && { invoiceTemplate }),
      ...(signature !== undefined && { signature }),
    };

    let company = user.company ? await Company.findById(user.company) : null;

    if (!company) {
      // Create new company (owner)
      if (!name) {
        return res.status(400).json({ message: 'Company name is required for new company' });
      }
      company = new Company({
        name,
        trn,
        websiteLink,
        stamp,
        invoiceTemplate,
        signature,
        owner: userId,
        ...otherFields,
      });
    } else {
      // Update existing company
      Object.assign(company, updateData);
    }

    await company.save();

    // Link company to user if not already linked
    if (!user.company) {
      user.company = company._id;
      await user.save();
    }

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
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await User.findById(userId).populate('company');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.company) {
      return res.status(404).json({ message: 'No company associated with this user' });
    }

    res.json({
      data: user.company,
    });
  } catch (error) {
    console.error('Get owner company error:', error);
    res.status(500).json({ message: 'Failed to fetch company', error: error.message });
  }
};

export const updateCompany = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const company = await Company.findByIdAndUpdate(id, updateData, { new: true });
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
    const { name, trn, stamp, invoiceTemplate, signature } = req.body;

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
      stamp,
      invoiceTemplate,
      signature,
    });

    await company.save();

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
    const companies = await Company.find({}).sort({ createdAt: -1 });
    res.json({ data: companies });
  } catch (error) {
    console.error('Get companies error:', error);
    res.status(500).json({ message: 'Failed to fetch companies', error: error.message });
  }
};

export const getCompany = async (req, res) => {
  try {
    const company = await Company.findById(req.params.id);
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
    const deleted = await Company.findByIdAndDelete(req.params.id);
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
    const companies = await Company.find({}).sort({ createdAt: -1 });
    res.json({ data: companies });
  } catch (error) {
    console.error('Get client companies error:', error);
    res.status(500).json({ message: 'Failed to fetch client companies', error: error.message });
  }
};
